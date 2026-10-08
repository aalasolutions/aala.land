/** A card payment of the subscription, less refunds already made on it. */
export interface RefundablePayment {
  billingHistoryId: string | null;
  providerInvoiceId: string;
  currency: string;
  refundable: number;
}

export interface CancelRefundInput {
  periodStart: Date;
  periodEnd: Date;
  executedAt: Date;
  /** False when the current period was never paid: its unused share is then zero. */
  periodPaid: boolean;
  /** Lines still held, at their full-period gross unit price in minor units. */
  heldLines: { quantity: number; unitGross: number }[];
  /** Prorated charges minus credits waiting for the next bill; negative is credit held. */
  pendingNextBill: number;
  /** Provider credit balance, returned in cash because no bill follows. */
  creditBalance: number;
  /** Card payments of the subscription still refundable; credit-paid amounts excluded. */
  cardRefundable: number;
}

export interface CancelRefundBreakdown {
  periodStart: string;
  periodEnd: string;
  executedAt: string;
  periodPaid: boolean;
  periodMs: number;
  unusedMs: number;
  heldValue: number;
  unusedHeldValue: number;
  pendingNextBill: number;
  creditBalance: number;
  uncapped: number;
  cardRefundable: number;
  /** Minor units, rounded down, at most cardRefundable. */
  amount: number;
}

/** Unused share of held lines, pending credit and balance, capped at card money. */
export function computeCancelRefund(
  input: CancelRefundInput,
): CancelRefundBreakdown {
  const start = input.periodStart.getTime();
  const end = input.periodEnd.getTime();
  const at = input.executedAt.getTime();
  const periodMs = Math.max(end - start, 0);
  const unusedMs = Math.min(Math.max(end - at, 0), periodMs);
  const heldValue = input.heldLines.reduce(
    (sum, line) =>
      sum + Math.max(line.quantity, 0) * Math.max(line.unitGross, 0),
    0,
  );
  // BigInt keeps amount times milliseconds exact; division floors to the minor unit.
  const unusedHeldValue =
    input.periodPaid && periodMs > 0
      ? Number((BigInt(heldValue) * BigInt(unusedMs)) / BigInt(periodMs))
      : 0;
  const creditBalance = Math.max(input.creditBalance, 0);
  const uncapped = unusedHeldValue - input.pendingNextBill + creditBalance;
  const cardRefundable = Math.max(input.cardRefundable, 0);
  return {
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    executedAt: input.executedAt.toISOString(),
    periodPaid: input.periodPaid,
    periodMs,
    unusedMs,
    heldValue,
    unusedHeldValue,
    pendingNextBill: input.pendingNextBill,
    creditBalance,
    uncapped,
    cardRefundable,
    amount: Math.min(Math.max(uncapped, 0), cardRefundable),
  };
}

/** Spreads a refund over payments in order, each up to its refundable amount. */
export function allocateCancelRefund(
  amount: number,
  payments: RefundablePayment[],
): { payment: RefundablePayment; amount: number }[] {
  let remaining = amount;
  const out: { payment: RefundablePayment; amount: number }[] = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, payment.refundable);
    if (take <= 0) continue;
    out.push({ payment, amount: take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new Error(`Refund of ${amount} exceeds the refundable payments`);
  }
  return out;
}
