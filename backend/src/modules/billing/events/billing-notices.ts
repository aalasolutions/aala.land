import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '@shared/utils/error.util';
import type { RefundState } from '../provider/billing-provider.interface';

export interface BillingNoticeMap {
  DowngradeRequested: { companyId: string; effectiveAt: Date };
  /** reason is one plain sentence; the paid plan keeps renewing. */
  DowngradeCancelled: { companyId: string; reason: string };
  RefundRequested: { companyId: string; amount: number; currency: string };
  RefundFailed: { companyId: string; amount: number; currency: string };
  RefundSettled: {
    companyId: string;
    amount: number;
    currency: string;
    state: Exclude<RefundState, 'pending'>;
  };
}

export type BillingNoticeName = keyof BillingNoticeMap;

type NoticeHandler<N extends BillingNoticeName> = (
  notice: BillingNoticeMap[N],
) => Promise<void>;

/** A failing handler never fails billing. */
@Injectable()
export class BillingNotices {
  private readonly logger = new Logger(BillingNotices.name);
  private readonly handlers: {
    [N in BillingNoticeName]?: NoticeHandler<N>[];
  } = {};

  on<N extends BillingNoticeName>(name: N, handler: NoticeHandler<N>): void {
    const list: NoticeHandler<N>[] = this.handlers[name] ?? [];
    list.push(handler);
    (this.handlers as Record<N, NoticeHandler<N>[]>)[name] = list;
  }

  async emit<N extends BillingNoticeName>(
    name: N,
    notice: BillingNoticeMap[N],
  ): Promise<void> {
    const list: NoticeHandler<N>[] = this.handlers[name] ?? [];
    for (const handler of list) {
      try {
        await handler(notice);
      } catch (err) {
        this.logger.error(`${name} notice failed: ${errorMessage(err)}`);
      }
    }
  }
}
