import { Job } from 'bullmq';
import { WhatsappAiDebounceProcessor } from './whatsapp-ai-debounce.processor';
import { ChatLockTimeoutError } from './whatsapp-ai.service';
import { DebounceJobData } from './wa-types';

const JOB_ID = 'user-1:c1:0';

const makeJob = (
  overrides: Partial<DebounceJobData> = {},
  id: string | null = JOB_ID,
): Job<DebounceJobData> =>
  ({
    id: id ?? undefined,
    data: {
      userId: 'user-1',
      chatId: 'c1',
      companyId: 'company-1',
      deadlineAt: Date.now() + 60000,
      ...overrides,
    },
  }) as Job<DebounceJobData>;

describe('WhatsappAiDebounceProcessor', () => {
  const makeAi = (buffer: unknown) => ({
    takeDebouncedBuffer: jest.fn().mockResolvedValue(buffer),
    runTurn: jest.fn().mockResolvedValue(undefined),
    releaseClaimedBuffer: jest.fn().mockResolvedValue(undefined),
    restoreClaimedBuffer: jest.fn().mockResolvedValue(undefined),
  });

  const makeCloud = () => ({
    senderFor: jest.fn().mockImplementation(() => async () => ({})),
    markReadFor: jest.fn().mockImplementation(() => async () => undefined),
  });

  it('claims the buffer and runs the turn with the Cloud API sender', async () => {
    const ai = makeAi({ combinedText: 'hi\nthere', messageIds: ['m1', 'm2'] });
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);

    await processor.process(makeJob());

    expect(ai.takeDebouncedBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', chatId: 'c1' }),
      JOB_ID,
    );
    expect(cloud.senderFor).toHaveBeenCalledWith('company-1', 'user-1');
    expect(cloud.markReadFor).toHaveBeenCalledWith('company-1', 'user-1');
    expect(ai.runTurn).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'c1',
      ['m1', 'm2'],
      'hi\nthere',
      cloud.senderFor.mock.results[0].value,
      cloud.markReadFor.mock.results[0].value,
    );
    expect(ai.releaseClaimedBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', chatId: 'c1' }),
      JOB_ID,
    );
    expect(ai.restoreClaimedBuffer).not.toHaveBeenCalled();
  });

  it('does not run a turn when the buffer was already claimed', async () => {
    const ai = makeAi(null);
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);

    await processor.process(makeJob());

    expect(ai.runTurn).not.toHaveBeenCalled();
    expect(cloud.senderFor).not.toHaveBeenCalled();
  });

  it('restores the claimed buffer and rethrows when the turn throws', async () => {
    const ai = makeAi({ combinedText: 'hello', messageIds: ['m1'] });
    ai.runTurn.mockRejectedValue(new Error('redis blip'));
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);

    await expect(processor.process(makeJob())).rejects.toThrow('redis blip');

    expect(ai.restoreClaimedBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', chatId: 'c1' }),
      JOB_ID,
    );
    expect(ai.releaseClaimedBuffer).not.toHaveBeenCalled();
  });

  it('restores this job claim and rethrows when the claim itself throws after the rename', async () => {
    const ai = makeAi(null);
    ai.takeDebouncedBuffer.mockRejectedValue(new Error('lrange blip'));
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);

    await expect(processor.process(makeJob())).rejects.toThrow('lrange blip');

    expect(ai.restoreClaimedBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', chatId: 'c1' }),
      JOB_ID,
    );
    expect(ai.runTurn).not.toHaveBeenCalled();
    expect(ai.releaseClaimedBuffer).not.toHaveBeenCalled();
  });

  it('refuses a job with no id before claiming anything', async () => {
    const ai = makeAi({ combinedText: 'hello', messageIds: ['m1'] });
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);

    await expect(processor.process(makeJob({}, null))).rejects.toThrow(
      'Debounce job has no id',
    );

    expect(ai.takeDebouncedBuffer).not.toHaveBeenCalled();
    expect(ai.restoreClaimedBuffer).not.toHaveBeenCalled();
  });

  it('restores and warns without failing the job on a chat lock timeout', async () => {
    const ai = makeAi({ combinedText: 'hello', messageIds: ['m1'] });
    ai.runTurn.mockRejectedValue(
      new ChatLockTimeoutError('Timed out waiting 20000ms'),
    );
    const processor = new WhatsappAiDebounceProcessor(
      ai as any,
      makeCloud() as any,
    );
    const warn = jest
      .spyOn((processor as any).logger, 'warn')
      .mockImplementation(() => undefined);
    const error = jest.spyOn((processor as any).logger, 'error');

    await expect(processor.process(makeJob())).resolves.toBeUndefined();

    expect(ai.restoreClaimedBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', chatId: 'c1' }),
      JOB_ID,
    );
    expect(ai.releaseClaimedBuffer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Timed out waiting'),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('still rethrows the turn failure when the restore itself fails', async () => {
    const ai = makeAi({ combinedText: 'hello', messageIds: ['m1'] });
    ai.runTurn.mockRejectedValue(new Error('redis blip'));
    ai.restoreClaimedBuffer.mockRejectedValue(new Error('restore blip'));
    const cloud = makeCloud();
    const processor = new WhatsappAiDebounceProcessor(ai as any, cloud as any);
    jest
      .spyOn((processor as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(processor.process(makeJob())).rejects.toThrow('redis blip');
  });
});
