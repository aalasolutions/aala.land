import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  ApiError,
  Environment,
  Paddle,
  type CountryCode,
  type CurrencyCode,
  type Subscription,
} from '@paddle/paddle-node-sdk';
import {
  BillingPlan,
  BillingPriceKind,
  BillingProvider,
  ChangePlanInput,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  EnsureCustomerInput,
  PriceOverride,
  ProviderWebhookEvent,
  SubscriptionRef,
} from './billing-provider.interface';
import {
  ChargedUnitAmount,
  NormalizedBillingEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  PlanChangedEvent,
  SeatQuantityChangedEvent,
  SubscriptionActivatedEvent,
  SubscriptionCanceledEvent,
  SubscriptionUpdatedEvent,
} from '../events/billing-events';
import { errorMessage } from '@shared/utils/error.util';
import { PADDLE_COUNTRIES } from './paddle-countries';

/** Seat ops hold a PG advisory lock; the SDK has no timeout option, so calls are raced. */
const REQUEST_TIMEOUT_MS = 8000;
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;
const SEAT_QUANTITY_MAX = 10000;
const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];
// Seats bill from the next period; plan switches prorate at once.
const SEAT_PRORATION = 'prorated_next_billing_period' as const;
const PLAN_PRORATION = 'prorated_immediately' as const;
const SEAT_SETTLE_NOW_PRORATION = 'prorated_immediately' as const;
const CHECKOUT_PAGE_PATH = '/checkout';

/** Webhook bodies are read raw (snake_case); only the fields used here are typed. */
interface PaddleRawPrice {
  id?: string | null;
  custom_data?: Record<string, unknown> | null;
}

interface PaddleRawSubscription {
  id?: string | null;
  status?: string | null;
  customer_id?: string | null;
  currency_code?: string | null;
  canceled_at?: string | null;
  custom_data?: Record<string, unknown> | null;
  current_billing_period?: { ends_at?: string | null } | null;
  items?: { quantity?: number | null; price?: PaddleRawPrice | null }[] | null;
}

interface PaddleRawTransaction {
  id?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  currency_code?: string | null;
  custom_data?: Record<string, unknown> | null;
  billing_period?: {
    starts_at?: string | null;
    ends_at?: string | null;
  } | null;
  origin?: string | null;
  items?: { price?: PaddleRawPrice | null }[] | null;
  details?: {
    totals?: {
      grand_total?: string | null;
      credit?: string | null;
      credit_to_balance?: string | null;
    } | null;
    line_items?: PaddleRawLineItem[] | null;
  } | null;
  payments?: unknown[] | null;
}

interface PaddleRawLineItem {
  price_id?: string | null;
  quantity?: number | null;
  proration?: unknown;
  unit_totals?: { subtotal?: string | null; total?: string | null } | null;
}

interface PaddleRawEvent {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown> | null;
}

export interface PaddleLine {
  priceId: string;
  kind: string | null;
  quantity: number;
}

export function isoToDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** Paddle amounts are integer strings in minor units. */
export function minorUnits(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return null;
  return Number(value);
}

/** Throws unless the header carries a fresh ts and an h1 matching HMAC-SHA256(`${ts}:${body}`). */
export function verifyPaddleSignature(
  rawBody: Buffer,
  header: string,
  secret: string,
  nowMs: number = Date.now(),
): void {
  let ts: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'h1') signatures.push(value);
  }
  if (!ts || !/^\d+$/.test(ts) || signatures.length === 0) {
    throw new Error('Malformed Paddle-Signature header');
  }
  if (
    Math.abs(nowMs / 1000 - Number(ts)) > PADDLE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new Error('Paddle-Signature timestamp is outside the tolerance');
  }
  const expected = createHmac('sha256', secret)
    .update(`${ts}:`)
    .update(rawBody)
    .digest();
  // Several h1 values appear while a secret is being rotated; any match passes.
  const matched = signatures.some(
    (sig) =>
      /^[0-9a-f]{64}$/i.test(sig) &&
      timingSafeEqual(Buffer.from(sig, 'hex'), expected),
  );
  if (!matched) throw new Error('Paddle-Signature does not match');
}

/** Model A: PRO bills every seat on the SEAT line; ENTERPRISE base includes the first seat. */
export function deriveSubscriptionShape(
  lines: PaddleLine[],
  periodEnd: string | null | undefined,
): { plan: BillingPlan; quantity: number; currentPeriodEnd: Date | null } {
  // Plan comes from paid lines only: custom_data is settable from the browser checkout.
  const hasBase = lines.some((l) => l.kind === 'ENTERPRISE_BASE');
  const seatLineQty = lines.find((l) => l.kind === 'SEAT')?.quantity ?? 0;
  const plan: BillingPlan = hasBase ? 'ENTERPRISE' : 'PRO';
  const quantity = Math.max(
    plan === 'ENTERPRISE' ? seatLineQty + 1 : seatLineQty,
    1,
  );
  return { plan, quantity, currentPeriodEnd: isoToDate(periodEnd) };
}

/** Spreads a partial refund over the transaction's line items, capped at each line's total. */
export function allocateRefund(
  lineItems: { id: string; totals?: { total?: string | null } | null }[],
  amountMinor: number,
): { itemId: string; type: 'partial'; amount: string }[] {
  let remaining = amountMinor;
  const out: { itemId: string; type: 'partial'; amount: string }[] = [];
  for (const line of lineItems) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, minorUnits(line.totals?.total) ?? 0);
    if (take <= 0) continue;
    out.push({ itemId: line.id, type: 'partial', amount: String(take) });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(
      `Refund of ${amountMinor} exceeds the refundable line item totals`,
    );
  }
  return out;
}

function isPriceKind(value: unknown): value is BillingPriceKind {
  return value === 'SEAT' || value === 'ENTERPRISE_BASE';
}

/** One amount per kind from full-period lines; prorated lines never set a price. */
export function chargedUnitAmounts(
  txn: PaddleRawTransaction,
): ChargedUnitAmount[] {
  const kindByPrice = new Map<string, BillingPriceKind>();
  for (const item of txn.items ?? []) {
    const priceId = stringOrNull(item.price?.id);
    const kind = item.price?.custom_data?.kind;
    if (priceId && isPriceKind(kind)) kindByPrice.set(priceId, kind);
  }
  const out: ChargedUnitAmount[] = [];
  for (const line of txn.details?.line_items ?? []) {
    const priceId = stringOrNull(line.price_id);
    const kind = priceId ? kindByPrice.get(priceId) : undefined;
    if (!kind || line.proration || (line.quantity ?? 0) < 1) continue;
    if (out.some((c) => c.kind === kind)) continue;
    const net = minorUnits(line.unit_totals?.subtotal);
    const gross = minorUnits(line.unit_totals?.total);
    if (net == null || gross == null) continue;
    out.push({ kind, net, gross });
  }
  return out;
}

function rawLines(sub: PaddleRawSubscription): PaddleLine[] {
  return (sub.items ?? []).flatMap((item) => {
    const priceId = stringOrNull(item.price?.id);
    if (!priceId) return [];
    return [
      {
        priceId,
        kind: stringOrNull(item.price?.custom_data?.kind),
        quantity: item.quantity ?? 0,
      },
    ];
  });
}

function apiLines(sub: Subscription): PaddleLine[] {
  return sub.items.flatMap((item) => {
    const priceId = stringOrNull(item.price?.id);
    if (!priceId) return [];
    return [
      {
        priceId,
        kind: stringOrNull(
          (item.price?.customData as Record<string, unknown> | null)?.kind,
        ),
        quantity: item.quantity ?? 0,
      },
    ];
  });
}

function money(
  amountMinor: number,
  currency: string,
): { amount: string; currencyCode: CurrencyCode } {
  return {
    amount: String(amountMinor),
    currencyCode: currency.toUpperCase() as CurrencyCode,
  };
}

// Paddle's payment currencies (the SDK CurrencyCode union).
const PADDLE_CURRENCIES: readonly string[] = [
  'usd',
  'eur',
  'gbp',
  'jpy',
  'aud',
  'cad',
  'chf',
  'clp',
  'hkd',
  'sgd',
  'sek',
  'ars',
  'brl',
  'cny',
  'cop',
  'czk',
  'dkk',
  'huf',
  'ils',
  'inr',
  'krw',
  'mxn',
  'nok',
  'nzd',
  'pen',
  'pln',
  'rub',
  'thb',
  'try',
  'twd',
  'uah',
  'vnd',
  'zar',
];

@Injectable()
export class PaddleBillingProvider implements BillingProvider {
  readonly name = 'paddle';
  readonly signatureHeader = 'paddle-signature';
  readonly baseCurrencies = ['usd'];
  readonly supportsCountryOverrides = true;
  readonly supportsTaxMode = true;
  readonly checkoutQuantityEditable = true;
  readonly supportedCurrencies = PADDLE_CURRENCIES;
  readonly supportedCountries = PADDLE_COUNTRIES;
  private readonly logger = new Logger(PaddleBillingProvider.name);
  private readonly paddle: Paddle;
  private productIdCache: string | null = null;

  constructor(private readonly config: ConfigService) {
    const environment =
      this.config.get<string>('PADDLE_ENVIRONMENT')?.trim() || 'sandbox';
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new Error(
        `Unsupported PADDLE_ENVIRONMENT "${environment}". Use "sandbox" or "production".`,
      );
    }
    this.paddle = new Paddle(this.config.getOrThrow<string>('PADDLE_API_KEY'), {
      environment:
        environment === 'production'
          ? Environment.production
          : Environment.sandbox,
    });
  }

  async ensureCustomer(input: EnsureCustomerInput): Promise<string> {
    if (!input.email) {
      throw new BadRequestException(
        'Company has no active admin email for billing',
      );
    }
    const email = input.email;
    // No idempotency key in Paddle: the unique-email conflict collapses a retried create instead.
    try {
      const customer = await this.call('customers.create', () =>
        this.paddle.customers.create({
          email,
          name: input.companyName,
          customData: { companyId: input.companyId },
        }),
      );
      return customer.id;
    } catch (err) {
      const existingId = await this.existingCustomerId(
        err,
        email,
        input.companyId,
      );
      if (existingId) return existingId;
      throw err;
    }
  }

  async ensurePrice(
    kind: BillingPriceKind,
    currency: string,
    unitAmount: number,
    overrides: PriceOverride[] = [],
    taxInclusive = true,
  ): Promise<string> {
    const productId = await this.ensureProduct();
    // Always a new price: amounts are never mutated, the row is repointed instead.
    const price = await this.call('prices.create', () =>
      this.paddle.prices.create({
        productId,
        description: `${kind} monthly`,
        unitPrice: money(unitAmount, currency),
        billingCycle: { interval: 'month', frequency: 1 },
        quantity:
          kind === 'SEAT'
            ? { minimum: 1, maximum: SEAT_QUANTITY_MAX }
            : { minimum: 1, maximum: 1 },
        unitPriceOverrides: overrides.map((o) => ({
          countryCodes: o.countryCodes.map(
            (c) => c.toUpperCase() as CountryCode,
          ),
          unitPrice: money(o.unitAmount, o.currency),
        })),
        customData: { kind, currency },
        taxMode: taxInclusive ? 'internal' : 'external',
      }),
    );
    return price.id;
  }

  async archivePrice(priceId: string): Promise<void> {
    await this.call('prices.archive', () =>
      this.paddle.prices.archive(priceId),
    );
  }

  async parseWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<ProviderWebhookEvent> {
    // Read lazily: envs without webhooks still boot; missing secret fails the webhook, not startup.
    const secret = this.config.getOrThrow<string>('PADDLE_WEBHOOK_SECRET');
    verifyPaddleSignature(rawBody, signature, secret);
    const event = JSON.parse(rawBody.toString('utf8')) as PaddleRawEvent;
    if (!event.event_id || !event.event_type) {
      throw new Error('Paddle webhook body has no event_id or event_type');
    }
    const events = await this.normalizeEvent(event);
    return {
      providerEventId: event.event_id,
      providerEventType: event.event_type,
      payload: event as unknown as Record<string, unknown>,
      events,
    };
  }

  private async normalizeEvent(
    event: PaddleRawEvent,
  ): Promise<NormalizedBillingEvent[]> {
    const occurredAt = isoToDate(event.occurred_at) ?? new Date();
    switch (event.event_type) {
      case 'subscription.created':
      case 'subscription.activated':
      case 'subscription.updated':
      case 'subscription.past_due':
      case 'subscription.canceled':
        return this.normalizeSubscriptionEvent(event, occurredAt);
      case 'transaction.completed':
      case 'transaction.payment_failed':
        return this.normalizeTransactionEvent(event, occurredAt);
      default:
        return [];
    }
  }

  private async normalizeSubscriptionEvent(
    event: PaddleRawEvent,
    occurredAt: Date,
  ): Promise<NormalizedBillingEvent[]> {
    const sub = (event.data ?? {}) as PaddleRawSubscription;
    const customerId = stringOrNull(sub.customer_id);
    const subscriptionId = stringOrNull(sub.id);
    const companyId = await this.resolveCompanyId(
      stringOrNull(sub.custom_data?.companyId),
      customerId,
    );
    if (!companyId || !customerId || !subscriptionId) {
      this.logger.warn(
        `Webhook ${event.event_id} (${event.event_type}): companyId unresolved, emitting no events`,
      );
      return [];
    }
    const base = { companyId, customerId, subscriptionId, occurredAt };
    const status = sub.status ?? 'unknown';

    // A canceled status in any event means canceled, so a late updated event cannot re-tier.
    if (event.event_type === 'subscription.canceled' || status === 'canceled') {
      const canceled: SubscriptionCanceledEvent = {
        name: 'SubscriptionCanceled',
        ...base,
        endedAt: isoToDate(sub.canceled_at),
      };
      return [canceled];
    }

    const { plan, quantity, currentPeriodEnd } = deriveSubscriptionShape(
      rawLines(sub),
      sub.current_billing_period?.ends_at,
    );

    if (event.event_type === 'subscription.created') {
      if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) return [];
      const activated: SubscriptionActivatedEvent = {
        name: 'SubscriptionActivated',
        ...base,
        plan,
        quantity,
        status,
        currency: (sub.currency_code ?? 'usd').toLowerCase(),
        currentPeriodEnd,
      };
      return [activated];
    }

    // Paddle sends no previous state, so seat and plan are re-asserted; both handlers are idempotent.
    const updated: SubscriptionUpdatedEvent = {
      name: 'SubscriptionUpdated',
      ...base,
      plan,
      quantity,
      status,
      currentPeriodEnd,
    };
    const seatChanged: SeatQuantityChangedEvent = {
      name: 'SeatQuantityChanged',
      ...base,
      quantity,
    };
    const planChanged: PlanChangedEvent = {
      name: 'PlanChanged',
      ...base,
      plan,
      quantity,
    };
    return [updated, seatChanged, planChanged];
  }

  private async normalizeTransactionEvent(
    event: PaddleRawEvent,
    occurredAt: Date,
  ): Promise<NormalizedBillingEvent[]> {
    const txn = (event.data ?? {}) as PaddleRawTransaction;
    const subscriptionId = stringOrNull(txn.subscription_id);
    // Checkout attempts before a subscription exists are not billing history.
    if (!subscriptionId) return [];
    const customerId = stringOrNull(txn.customer_id);
    const companyId = await this.resolveCompanyId(
      stringOrNull(txn.custom_data?.companyId),
      customerId,
    );
    if (!companyId || !customerId) {
      this.logger.warn(
        `Webhook ${event.event_id} (${event.event_type}): companyId unresolved, emitting no events`,
      );
      return [];
    }

    const amount = minorUnits(txn.details?.totals?.grand_total);
    if (amount == null) {
      this.logger.warn(
        `Webhook ${event.event_id} (${event.event_type}): transaction ${txn.id ?? '?'} has no amount; defaulting to 0`,
      );
    }
    if (txn.currency_code == null) {
      this.logger.warn(
        `Webhook ${event.event_id} (${event.event_type}): transaction ${txn.id ?? '?'} has no currency; defaulting to usd`,
      );
    }
    const common = {
      companyId,
      customerId,
      subscriptionId,
      occurredAt,
      // Paddle invoice links are short-lived and fetched on demand, so none are stored.
      hostedInvoiceUrl: null,
      invoicePdfUrl: null,
      periodStart: isoToDate(txn.billing_period?.starts_at),
      periodEnd: isoToDate(txn.billing_period?.ends_at),
      amount: amount ?? 0,
      currency: (txn.currency_code ?? 'usd').toLowerCase(),
      invoiceId: stringOrNull(txn.id),
    };

    if (event.event_type === 'transaction.payment_failed') {
      const failed: PaymentFailedEvent = {
        name: 'PaymentFailed',
        ...common,
        attemptCount: Array.isArray(txn.payments) ? txn.payments.length : null,
      };
      return [failed];
    }
    // Zero-total completions are recorded, never a paid-status signal.
    const succeeded: PaymentSucceededEvent = {
      name: 'PaymentSucceeded',
      ...common,
      creditApplied: minorUnits(txn.details?.totals?.credit) ?? 0,
      creditIssued: minorUnits(txn.details?.totals?.credit_to_balance) ?? 0,
      origin: stringOrNull(txn.origin),
      settledWithoutCharge: amount === 0,
      chargedUnitAmounts: chargedUnitAmounts(txn),
    };
    return [succeeded];
  }

  /** Resolution order: event custom_data, then customer custom_data; null if neither. */
  private async resolveCompanyId(
    customDataCompanyId: string | null,
    customerId: string | null,
  ): Promise<string | null> {
    if (customDataCompanyId) return customDataCompanyId;
    if (!customerId) return null;
    try {
      const customer = await this.call('customers.get', () =>
        this.paddle.customers.get(customerId),
      );
      return stringOrNull(
        (customer.customData as Record<string, unknown> | null)?.companyId,
      );
    } catch (err) {
      this.logger.warn(
        `Customer lookup failed for ${customerId}: ${errorMessage(err)}`,
      );
      return null;
    }
  }

  private async existingCustomerId(
    err: unknown,
    email: string,
    companyId: string,
  ): Promise<string | null> {
    if (!(err instanceof ApiError) || err.code !== 'customer_already_exists') {
      return null;
    }
    const existingId =
      /ctm_[a-z0-9]+/i.exec(err.detail ?? '')?.[0] ??
      (await this.findCustomerIdByEmail(email));
    if (!existingId) return null;
    const existing = await this.call('customers.get', () =>
      this.paddle.customers.get(existingId),
    );
    const owner = (existing.customData as Record<string, unknown> | null)
      ?.companyId;
    if (owner !== companyId) {
      throw new ConflictException(
        'This billing email already belongs to another billing account.',
      );
    }
    return existingId;
  }

  private async findCustomerIdByEmail(email: string): Promise<string | null> {
    const found = await this.call('customers.list', () =>
      this.paddle.customers.list({ email: [email] }).next(),
    );
    return found[0]?.id ?? null;
  }

  private async ensureProduct(): Promise<string> {
    if (this.productIdCache) return this.productIdCache;
    const products = await this.call('products.list', () =>
      this.paddle.products.list({ status: ['active'], perPage: 200 }).next(),
    );
    const found = products.find(
      (p) =>
        (p.customData as Record<string, unknown> | null)?.aala_product ===
        'subscription',
    );
    if (found) {
      this.productIdCache = found.id;
      return found.id;
    }
    const product = await this.call('products.create', () =>
      this.paddle.products.create({
        name: 'AALA.LAND Subscription',
        taxCategory: 'saas',
        customData: { aala_product: 'subscription' },
      }),
    );
    this.logger.log(`Created Paddle product ${product.id}`);
    this.productIdCache = product.id;
    return product.id;
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult> {
    const items: { priceId: string; quantity: number }[] = [];
    if (input.basePriceId) {
      // Base fee, qty always 1. ENTERPRISE only; base includes the first seat.
      items.push({ priceId: input.basePriceId, quantity: 1 });
    }
    if (input.quantity > 0) {
      items.push({ priceId: input.seatPriceId, quantity: input.quantity });
    }
    const transaction = await this.call('transactions.create', () =>
      this.paddle.transactions.create({
        items,
        customerId: input.customerId,
        customData: { companyId: input.companyId },
        collectionMode: 'automatic',
      }),
    );
    // Our own page opens the checkout from _ptxn, so no Paddle-approved checkout domain is needed.
    const checkoutUrl = new URL(
      CHECKOUT_PAGE_PATH,
      new URL(input.successUrl).origin,
    );
    checkoutUrl.searchParams.set('_ptxn', transaction.id);
    checkoutUrl.searchParams.set('success', input.successUrl);
    checkoutUrl.searchParams.set('cancel', input.cancelUrl);
    return { checkoutUrl: checkoutUrl.toString(), subscriptionId: null };
  }

  async getSeatQuantity(ref: SubscriptionRef): Promise<number> {
    const sub = await this.getSubscription(ref.subscriptionId);
    // No SEAT line = solo ENTERPRISE (base covers the seat). PRO always has a SEAT line.
    const seat = apiLines(sub).find((l) => l.kind === 'SEAT');
    return Math.max(seat?.quantity ?? 0, 0);
  }

  async updateSeatQuantity(
    ref: SubscriptionRef,
    quantity: number,
    seatPriceId?: string,
    settleNow = false,
  ): Promise<void> {
    const sub = await this.getSubscription(ref.subscriptionId);
    const lines = apiLines(sub);
    const seat = lines.find((l) => l.kind === 'SEAT');
    let next: PaddleLine[];
    if (quantity <= 0) {
      // Drop to solo ENTERPRISE removes the seat line; PRO never reaches 0, floors at 1.
      if (!seat) return;
      next = lines.filter((l) => l !== seat);
    } else if (seat) {
      next = lines.map((l) => (l === seat ? { ...l, quantity } : l));
    } else {
      if (!seatPriceId) {
        throw new Error(
          `Cannot add a seat to ${ref.subscriptionId}: no existing SEAT item and no seat price id supplied`,
        );
      }
      next = [...lines, { priceId: seatPriceId, kind: 'SEAT', quantity }];
    }
    // Paddle replaces the whole item list, so every kept line is sent back.
    await this.call('subscriptions.update', () =>
      this.paddle.subscriptions.update(ref.subscriptionId, {
        items: next.map((l) => ({ priceId: l.priceId, quantity: l.quantity })),
        prorationBillingMode: settleNow
          ? SEAT_SETTLE_NOW_PRORATION
          : SEAT_PRORATION,
      }),
    );
  }

  async changePlan(input: ChangePlanInput): Promise<void> {
    const sub = await this.getSubscription(input.subscriptionId);
    const lines = apiLines(sub);
    if (!lines.length) {
      throw new Error(
        `Subscription ${input.subscriptionId} has no line items to change plan`,
      );
    }
    const currentBase = lines.find((l) => l.kind === 'ENTERPRISE_BASE');
    const currentSeat =
      lines.find((l) => l.kind === 'SEAT') ??
      lines.find((l) => l !== currentBase);
    const currentSeatQty = Math.max(currentSeat?.quantity ?? 0, 0);

    // Plan switch shifts seat line by 1 as base absorbs/releases a seat; reads LIVE qty, never DB.
    const toEnterprise = input.plan === 'ENTERPRISE';
    const newSeatQty = toEnterprise
      ? Math.max(currentSeatQty - 1, 0)
      : currentSeatQty + 1;

    const next = lines
      .filter((l) => l !== currentBase && l !== currentSeat)
      .map((l) => ({ priceId: l.priceId, quantity: l.quantity }));
    if (newSeatQty > 0) {
      next.push({ priceId: input.seatPriceId, quantity: newSeatQty });
    }
    if (input.basePriceId) {
      next.push({ priceId: input.basePriceId, quantity: 1 });
    }

    await this.call('subscriptions.update', () =>
      this.paddle.subscriptions.update(input.subscriptionId, {
        items: next,
        prorationBillingMode: PLAN_PRORATION,
      }),
    );
  }

  async cancel(ref: SubscriptionRef): Promise<void> {
    await this.call('subscriptions.cancel', () =>
      this.paddle.subscriptions.cancel(ref.subscriptionId, {
        effectiveFrom: 'next_billing_period',
      }),
    );
  }

  async getCancellationState(
    ref: SubscriptionRef,
  ): Promise<{ cancelAtPeriodEnd: boolean; cancelAt: Date | null }> {
    const sub = await this.getSubscription(ref.subscriptionId);
    const scheduledCancel =
      sub.scheduledChange?.action === 'cancel' ? sub.scheduledChange : null;
    return {
      cancelAtPeriodEnd: scheduledCancel !== null,
      cancelAt:
        isoToDate(scheduledCancel?.effectiveAt) ??
        isoToDate(sub.currentBillingPeriod?.endsAt),
    };
  }

  async resume(ref: SubscriptionRef): Promise<void> {
    await this.call('subscriptions.update', () =>
      this.paddle.subscriptions.update(ref.subscriptionId, {
        scheduledChange: null,
      }),
    );
  }

  async refundInvoicePayment(
    invoiceId: string,
    amountMinor: number | null,
  ): Promise<{ refundId: string }> {
    const reason = 'Make-it-right refund';
    if (amountMinor == null) {
      const adjustment = await this.call('adjustments.create', () =>
        this.paddle.adjustments.create({
          action: 'refund',
          transactionId: invoiceId,
          reason,
          type: 'full',
        }),
      );
      return { refundId: adjustment.id };
    }
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error(`Refund amount must be a positive integer`);
    }
    const transaction = await this.call('transactions.get', () =>
      this.paddle.transactions.get(invoiceId),
    );
    const items = allocateRefund(
      transaction.details?.lineItems ?? [],
      amountMinor,
    );
    // Large live refunds come back pending approval; the adjustment webhook settles them.
    const adjustment = await this.call('adjustments.create', () =>
      this.paddle.adjustments.create({
        action: 'refund',
        transactionId: invoiceId,
        reason,
        type: 'partial',
        items,
      }),
    );
    return { refundId: adjustment.id };
  }

  creditCustomerBalance(): Promise<{ creditId: string }> {
    return Promise.reject(
      new NotImplementedException(
        'Next-bill credit is not available on Paddle yet: the one-time next-bill discount is pending. Use a refund instead.',
      ),
    );
  }

  private getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.call('subscriptions.get', () =>
      this.paddle.subscriptions.get(subscriptionId),
    );
  }

  private async call<T>(label: string, op: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Paddle ${label} timed out after ${REQUEST_TIMEOUT_MS}ms`,
            ),
          ),
        REQUEST_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([op(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
