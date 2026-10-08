import { Test, TestingModule } from '@nestjs/testing';
import { BillingDowngradeCron } from './billing-downgrade.cron';
import { BillingDowngradeService } from './billing-downgrade.service';

describe('BillingDowngradeCron', () => {
  let cron: BillingDowngradeCron;
  let downgrades: jest.Mocked<Pick<BillingDowngradeService, 'executeDue'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingDowngradeCron,
        {
          provide: BillingDowngradeService,
          useValue: { executeDue: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    cron = module.get(BillingDowngradeCron);
    downgrades = module.get(BillingDowngradeService);
  });

  it('executes due requests as of now', async () => {
    const before = Date.now();
    await cron.run();
    const at = downgrades.executeDue.mock.calls[0][0];
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('never throws out of the scheduler', async () => {
    downgrades.executeDue.mockRejectedValue(new Error('db down'));
    await expect(cron.run()).resolves.toBeUndefined();
  });
});
