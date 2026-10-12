import { EntityManager, In } from 'typeorm';
import {
  PaymentRemedy,
  RemedyStatus,
} from '../console/entities/payment-remedy.entity';

/** Statuses that hold or returned money; rejected, reversed, failed do not. */
export const LIVE_REFUND_STATUSES: RemedyStatus[] = [
  'queued',
  'initiated',
  'approved',
];

/** A card payment known by its history row, its provider id, or both. */
export interface RefundedPayment {
  billingHistoryId: string | null;
  providerInvoiceId: string;
}

/** Sum of live refunds per provider payment id of one company, matched by either key. */
export async function liveRefundTotals(
  manager: EntityManager,
  companyId: string,
  payments: RefundedPayment[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (payments.length === 0) return totals;
  const invoiceByHistory = new Map<string, string>();
  for (const p of payments) {
    if (p.billingHistoryId) {
      invoiceByHistory.set(p.billingHistoryId, p.providerInvoiceId);
    }
  }
  const base = {
    companyId,
    kind: 'refund' as const,
    status: In(LIVE_REFUND_STATUSES),
  };
  const refunds = await manager.find(PaymentRemedy, {
    where: [
      ...(invoiceByHistory.size > 0
        ? [{ ...base, billingHistoryId: In([...invoiceByHistory.keys()]) }]
        : []),
      {
        ...base,
        providerInvoiceId: In(payments.map((p) => p.providerInvoiceId)),
      },
    ],
  });
  for (const refund of refunds) {
    const invoice =
      refund.providerInvoiceId ??
      (refund.billingHistoryId
        ? invoiceByHistory.get(refund.billingHistoryId)
        : undefined);
    if (invoice)
      totals.set(invoice, (totals.get(invoice) ?? 0) + refund.amount);
  }
  return totals;
}
