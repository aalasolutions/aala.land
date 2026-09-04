import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StrandedWhatsappRowsCron } from './stranded-whatsapp-rows.cron';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { WhatsappConnectionStatus } from '../../whatsapp/entities/whatsapp-connection.entity';

const COMPANY_ID = '068dfa72-9a27-4527-b3e4-a4251d7ed643';
const GONE_USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('StrandedWhatsappRowsCron', () => {
  let cron: StrandedWhatsappRowsCron;
  let query: jest.Mock;
  let disconnect: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    disconnect = jest.fn().mockResolvedValue({ success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrandedWhatsappRowsCron,
        { provide: DataSource, useValue: { query } },
        { provide: WhatsappService, useValue: { disconnect } },
      ],
    }).compile();

    cron = module.get<StrandedWhatsappRowsCron>(StrandedWhatsappRowsCron);
  });

  it('disconnects a number still CONNECTED for a departed user', async () => {
    query.mockResolvedValue([
      { company_id: COMPANY_ID, user_id: GONE_USER },
    ]);

    await cron.run();

    expect(disconnect).toHaveBeenCalledWith(GONE_USER, COMPANY_ID);
  });

  it('only looks at CONNECTED rows whose user is gone or deactivated', async () => {
    await cron.run();

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"whatsapp_connections"');
    expect(sql).toContain('u."id" IS NULL OR u."is_active" = false');
    expect(params).toEqual([WhatsappConnectionStatus.CONNECTED]);
  });

  it('does nothing when no departed user still holds a live number', async () => {
    await cron.run();

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('never moves chat or message rows off the departing agent', async () => {
    query.mockResolvedValue([
      { company_id: COMPANY_ID, user_id: GONE_USER },
    ]);

    await cron.run();

    // One read of whatsapp_connections and nothing else: no UPDATE of user_id anywhere.
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).not.toMatch(/UPDATE/i);
    expect(sql).not.toContain('whatsapp_chats');
    expect(sql).not.toContain('whatsapp_messages');
  });

  it('keeps sweeping the remaining connections after one fails', async () => {
    query.mockResolvedValue([
      { company_id: COMPANY_ID, user_id: GONE_USER },
      { company_id: 'company-2', user_id: 'user-2' },
    ]);
    disconnect.mockRejectedValueOnce(new Error('meta unreachable'));
    const error = jest
      .spyOn(cron['logger'], 'error')
      .mockImplementation(() => undefined);

    await cron.run();

    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
