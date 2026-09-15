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

  const ids = (n: number, prefix = 'p', startMs = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      createdAt: new Date(startMs + i),
    }));

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
    find.mockResolvedValueOnce([
      { id: 'p-1', createdAt: new Date(1) },
      { id: 'p-2', createdAt: new Date(2) },
    ]);
    const before = Date.now();

    await cron.run();

    const after = Date.now();
    const [opts] = find.mock.calls[0];
    const firstCond = opts.where[0];
    expect(firstCond.status).toBe(StoragePurgeStatus.PENDING);
    const cutoff: Date = firstCond.createdAt.value;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 5 * 60 * 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 5 * 60 * 1000);
    expect(opts.take).toBe(500);
    expect(dispatch).toHaveBeenCalledWith(['p-1', 'p-2']);
  });

  it('pages through batches of 500 using a keyset cursor, never skip', async () => {
    find
      .mockResolvedValueOnce(ids(500, 'a', 0))
      .mockResolvedValueOnce(ids(3, 'b', 1000));

    await cron.run();

    expect(find).toHaveBeenCalledTimes(2);
    // First page has no cursor: single OR-branch on status/cutoff only.
    expect(find.mock.calls[0][0].where).toHaveLength(1);
    expect(find.mock.calls[0][0].skip).toBeUndefined();

    // Second page resumes strictly after the last row of page one.
    const secondWhere = find.mock.calls[1][0].where;
    expect(find.mock.calls[1][0].skip).toBeUndefined();
    expect(secondWhere).toHaveLength(2);
    expect(secondWhere[0].createdAt.value[1].value).toEqual(new Date(499));
    expect(secondWhere[1].id.value).toBe('a-499');

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1][0]).toHaveLength(3);
  });

  it('stops when a page is shorter than the batch size, no trailing empty page', async () => {
    find.mockResolvedValueOnce(ids(2, 'c', 0));

    await cron.run();

    expect(find).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('dispatches nothing when no row is stale', async () => {
    await cron.run();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
