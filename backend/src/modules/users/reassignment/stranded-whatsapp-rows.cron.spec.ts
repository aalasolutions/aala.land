import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StrandedWhatsappRowsCron } from './stranded-whatsapp-rows.cron';
import { UserReassignmentService } from './user-reassignment.service';
import { MessageStoreService } from '../../whatsapp/message-store.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';

const COMPANY_ID = '068dfa72-9a27-4527-b3e4-a4251d7ed643';
const GONE_USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADMIN_USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('StrandedWhatsappRowsCron', () => {
  let cron: StrandedWhatsappRowsCron;
  let query: jest.Mock;
  let findOwnersNeedingRecovery: jest.Mock;
  let reassignWhatsappRows: jest.Mock;
  let dropSessionsWithoutActiveSeat: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([{ id: ADMIN_USER }]);
    findOwnersNeedingRecovery = jest.fn().mockResolvedValue([]);
    dropSessionsWithoutActiveSeat = jest.fn().mockResolvedValue(0);
    reassignWhatsappRows = jest.fn().mockResolvedValue({
      chats: 2,
      messages: 40,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrandedWhatsappRowsCron,
        { provide: DataSource, useValue: { query } },
        {
          provide: MessageStoreService,
          useValue: { findOwnersNeedingRecovery },
        },
        {
          provide: WhatsappService,
          useValue: { dropSessionsWithoutActiveSeat },
        },
        {
          provide: UserReassignmentService,
          useValue: { reassignWhatsappRows },
        },
      ],
    }).compile();

    cron = module.get<StrandedWhatsappRowsCron>(StrandedWhatsappRowsCron);
  });

  it('moves stranded rows onto the company admin', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
    ]);

    await cron.run();

    expect(reassignWhatsappRows).toHaveBeenCalledWith(
      COMPANY_ID,
      GONE_USER,
      ADMIN_USER,
    );
  });

  it('does nothing, and looks up no recipient, when nothing is stranded', async () => {
    await cron.run();

    expect(query).not.toHaveBeenCalled();
    expect(reassignWhatsappRows).not.toHaveBeenCalled();
  });

  it('kills sessions with no active seat even when no rows are stranded', async () => {
    await cron.run();

    expect(dropSessionsWithoutActiveSeat).toHaveBeenCalledTimes(1);
  });

  it('still recovers the rows when the session reconcile throws', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
    ]);
    dropSessionsWithoutActiveSeat.mockRejectedValue(new Error('socket gone'));

    await cron.run();

    expect(reassignWhatsappRows).toHaveBeenCalledWith(
      COMPANY_ID,
      GONE_USER,
      ADMIN_USER,
    );
  });

  it('accepts an ADMIN when the company has no active company_admin', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
    ]);

    await cron.run();

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"is_active" = true');
    expect(params[1]).toEqual(['company_admin', 'admin']);
    expect(sql).toContain('array_position');
  });

  it('skips a company with no eligible recipient instead of dropping the rows', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
    ]);
    query.mockResolvedValue([]);

    await cron.run();

    expect(reassignWhatsappRows).not.toHaveBeenCalled();
  });

  it('warns once per company, not on every run, when no recipient exists', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
    ]);
    query.mockResolvedValue([]);
    const warn = jest
      .spyOn(cron['logger'], 'warn')
      .mockImplementation(() => undefined);

    await cron.run();
    await cron.run();
    await cron.run();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps sweeping the remaining companies after one fails', async () => {
    findOwnersNeedingRecovery.mockResolvedValue([
      { companyId: COMPANY_ID, userId: GONE_USER },
      { companyId: 'company-2', userId: 'user-2' },
    ]);
    reassignWhatsappRows.mockRejectedValueOnce(new Error('deadlock detected'));

    await cron.run();

    expect(reassignWhatsappRows).toHaveBeenCalledTimes(2);
  });
});
