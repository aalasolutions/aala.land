import { Job, UnrecoverableError } from 'bullmq';
import { WhatsappMediaProcessor } from './whatsapp-media.processor';
import { WaMediaAwaitingConnectionError } from './whatsapp-media-ingest.service';
import { WaMediaJobData } from './wa-types';

const mediaJob = (attemptsMade: number, attempts = 5) =>
  ({
    id: 'job-1',
    data: { messageUuid: 'row-1', companyId: 'company-1' },
    attemptsMade,
    opts: { attempts },
  }) as unknown as Job<WaMediaJobData>;

describe('WhatsappMediaProcessor', () => {
  let processor: WhatsappMediaProcessor;
  let ingest: { ingest: jest.Mock };
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    ingest = { ingest: jest.fn().mockResolvedValue(undefined) };
    processor = new WhatsappMediaProcessor(ingest as any);
    error = jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(processor['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('delegates to the ingest with the attempts made and allowed', async () => {
    await processor.process(mediaJob(2));

    expect(ingest.ingest).toHaveBeenCalledWith(
      { messageUuid: 'row-1', companyId: 'company-1' },
      2,
      5,
    );
  });

  it('defaults missing attempt data to a first and only attempt', async () => {
    await processor.process({
      data: { messageUuid: 'row-1', companyId: 'company-1' },
    } as unknown as Job<WaMediaJobData>);

    expect(ingest.ingest).toHaveBeenCalledWith(expect.anything(), 0, 1);
  });

  it('logs a retried attempt as a warning', () => {
    processor.onFailed(mediaJob(2), new Error('timeout'));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attempt 2/5'));
    expect(error).not.toHaveBeenCalled();
  });

  it('logs the last attempt as an error', () => {
    processor.onFailed(mediaJob(5), new Error('timeout'));

    expect(error).toHaveBeenCalledWith(expect.stringContaining('media FAILED'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs an UnrecoverableError as final on the first attempt', () => {
    processor.onFailed(mediaJob(1), new UnrecoverableError('media gone'));

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('media FAILED: media gone'),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not log a stop for a missing connection as media FAILED', () => {
    processor.onFailed(
      mediaJob(1),
      new WaMediaAwaitingConnectionError('no connection'),
    );

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a failure without a job as final', () => {
    processor.onFailed(undefined, new Error('lost'));

    expect(error).toHaveBeenCalledWith(expect.stringContaining('job unknown'));
  });

  it('reads the worker concurrency from the environment at bootstrap', () => {
    const worker = { concurrency: 3 };
    Object.defineProperty(processor, 'worker', { get: () => worker });

    process.env.WHATSAPP_MEDIA_CONCURRENCY = '7';
    processor.onApplicationBootstrap();
    expect(worker.concurrency).toBe(7);

    delete process.env.WHATSAPP_MEDIA_CONCURRENCY;
    processor.onApplicationBootstrap();
    expect(worker.concurrency).toBe(3);
  });
});
