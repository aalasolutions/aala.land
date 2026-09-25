import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StorageQuotaReconcileCron } from './storage-quota-reconcile.cron';

describe('StorageQuotaReconcileCron', () => {
  let cron: StorageQuotaReconcileCron;
  let query: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageQuotaReconcileCron,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();

    cron = module.get(StorageQuotaReconcileCron);
    warn = jest
      .spyOn(cron['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  it('recomputes from the media, document and WhatsApp media SUM and only updates drifted rows', async () => {
    await cron.run();

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'COALESCE(pm.file_size, 0) + COALESCE(pm.thumbnail_size, 0)',
    );
    expect(sql).toContain('COALESCE(SUM(COALESCE(pd.file_size, 0)), 0)');
    expect(sql).toContain('COALESCE(SUM(COALESCE(wm.media_size_bytes, 0)), 0)');
    expect(sql).toContain("wm.media_status = 'STORED'");
    expect(sql).toContain('wm.media_type <> $1');
    expect(params).toEqual(['sticker']);
    expect(sql).toContain('UPDATE "companies"');
    expect(sql).toContain('a.old_bytes <> a.new_bytes');
  });

  it('logs the corrected company count and total drift', async () => {
    query.mockResolvedValue([
      { id: 'c1', old_bytes: '1000', new_bytes: '400' },
      { id: 'c2', old_bytes: '0', new_bytes: '250' },
    ]);

    await cron.run();

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/2 companies, total drift 850 bytes/),
    );
  });

  it('logs nothing when there is no drift', async () => {
    await cron.run();

    expect(warn).not.toHaveBeenCalled();
  });
});
