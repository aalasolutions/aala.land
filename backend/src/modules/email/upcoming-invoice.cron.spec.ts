import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { SystemEmailService } from './system-email.service';
import { UpcomingInvoiceCron } from './upcoming-invoice.cron';

describe('UpcomingInvoiceCron', () => {
  let cron: UpcomingInvoiceCron;
  let companyRepo: jest.Mocked<Pick<Repository<Company>, 'query'>>;
  let email: jest.Mocked<
    Pick<SystemEmailService, 'sendUpcomingInvoiceToCompany'>
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpcomingInvoiceCron,
        {
          provide: getRepositoryToken(Company),
          useValue: { query: jest.fn() },
        },
        {
          provide: SystemEmailService,
          useValue: { sendUpcomingInvoiceToCompany: jest.fn() },
        },
      ],
    }).compile();

    cron = module.get(UpcomingInvoiceCron);
    companyRepo = module.get(getRepositoryToken(Company));
    email = module.get(SystemEmailService);
  });

  it('sends a reminder for each renewing subscription', async () => {
    const periodEnd = new Date('2026-08-01T00:00:00Z');
    (companyRepo.query as jest.Mock).mockResolvedValue([
      { id: 'co-1', period_end: periodEnd, amount: 7500, currency: 'usd' },
      { id: 'co-2', period_end: periodEnd, amount: null, currency: null },
    ]);

    await cron.run();

    expect(email.sendUpcomingInvoiceToCompany).toHaveBeenCalledTimes(2);
    expect(email.sendUpcomingInvoiceToCompany).toHaveBeenCalledWith(
      'co-1',
      periodEnd,
      7500,
      'usd',
    );
  });

  it('does nothing when no subscriptions are renewing', async () => {
    (companyRepo.query as jest.Mock).mockResolvedValue([]);
    await cron.run();
    expect(email.sendUpcomingInvoiceToCompany).not.toHaveBeenCalled();
  });

  it('continues to the next company when one send throws', async () => {
    (companyRepo.query as jest.Mock).mockResolvedValue([
      { id: 'co-1', period_end: new Date(), amount: 100, currency: 'usd' },
      { id: 'co-2', period_end: new Date(), amount: 100, currency: 'usd' },
    ]);
    (email.sendUpcomingInvoiceToCompany as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(true);

    await expect(cron.run()).resolves.toBeUndefined();
    expect(email.sendUpcomingInvoiceToCompany).toHaveBeenCalledTimes(2);
  });
});
