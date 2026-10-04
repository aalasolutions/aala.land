import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { errorMessage } from '@shared/utils/error.util';
import { BillingDowngradeService } from './billing-downgrade.service';

@Injectable()
export class BillingDowngradeCron {
  private readonly logger = new Logger(BillingDowngradeCron.name);

  constructor(private readonly downgrades: BillingDowngradeService) {}

  @Cron('*/15 * * * *', { timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      await this.downgrades.executeDue(new Date());
    } catch (err) {
      this.logger.error(`Downgrade run failed: ${errorMessage(err)}`);
    }
  }
}
