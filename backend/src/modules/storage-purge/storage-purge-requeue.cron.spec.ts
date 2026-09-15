import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StoragePurgeRequeueCron } from './storage-purge-requeue.cron';
import { StoragePurgeService } from './storage-purge.service';
import {
  StoragePurgeJob,
  StoragePurgeStatus,
} from './entities/storage-purge-job.entity';

describe('StoragePurgeRequeueCron', () => {
  let cron: StoragePurgeRequeueCron;
  let find: jest.Mock;
  let dispatch: jest.Mock;

  const ids = (n: number, prefix = 'p') =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([]);
    dispatch = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoragePurgeRequeueCron,
        { provide: getRepositoryToken(StoragePurgeJob), useValue: { find } },
        { provide: StoragePurgeService, useValue: { dispatch } },
      ],
    }).compile();

    cron = module.get(StoragePurgeRequeueCron);
    jest.spyOn(cron['logger'], 'log').mockImplementation(() => undefined);
  });

  it('re-dispatches PENDING rows older than 5 minutes', async () => {
    find.mockResolvedValueOnce([{ id: 'p-1' }, { id: 'p-2' }]);
    const before = Date.now();

    await cron.run();

    const after = Date.now();
    const [opts] = find.mock.calls[0];
    expect(opts.where.status).toBe(StoragePurgeStatus.PENDING);
    const cutoff: Date = opts.where.createdAt.value;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 5 * 60 * 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 5 * 60 * 1000);
    expect(opts.take).toBe(500);
    expect(dispatch).toHaveBeenCalledWith(['p-1', 'p-2']);
  });

  it('pages through batches of 500', async () => {
    find
      .mockResolvedValueOnce(ids(500, 'a'))
      .mockResolvedValueOnce(ids(3, 'b'));

    await cron.run();

    expect(find).toHaveBeenCalledTimes(2);
    expect(find.mock.calls[1][0].skip).toBe(500);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0]).toHaveLength(3);
  });

  it('dispatches nothing when no row is stale', async () => {
    await cron.run();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
