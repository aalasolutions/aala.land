import { Job } from 'bullmq';
import { WhatsappWebhookProcessor } from './whatsapp-webhook.processor';
import { WaWebhookJobData } from './wa-types';

const makeJob = (envelope: unknown, id = 'job-1'): Job<WaWebhookJobData> =>
  ({ id, data: { envelope } }) as Job<WaWebhookJobData>;

describe('WhatsappWebhookProcessor', () => {
  const makeWebhook = () => ({
    processEnvelope: jest.fn().mockResolvedValue(undefined),
  });

  it('passes the job envelope through to processEnvelope', async () => {
    const webhook = makeWebhook();
    const processor = new WhatsappWebhookProcessor(webhook as any);
    const envelope = { entry: [{ changes: [{ value: {} }] }] };

    await processor.process(makeJob(envelope));

    expect(webhook.processEnvelope).toHaveBeenCalledTimes(1);
    expect(webhook.processEnvelope).toHaveBeenCalledWith(envelope);
  });

  it('lets an envelope-level failure escape so BullMQ retries the job', async () => {
    const webhook = makeWebhook();
    webhook.processEnvelope.mockRejectedValue(new Error('entry is not iterable'));
    const processor = new WhatsappWebhookProcessor(webhook as any);

    await expect(processor.process(makeJob({ entry: 5 }))).rejects.toThrow(
      'entry is not iterable',
    );
  });

  it('logs the failure event with the job id and the reason', () => {
    const processor = new WhatsappWebhookProcessor(makeWebhook() as any);
    const error = jest
      .spyOn((processor as any).logger, 'error')
      .mockImplementation(() => undefined);

    processor.onFailed(makeJob({}, 'job-7'), new Error('redis blip'));

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('job-7');
    expect(String(error.mock.calls[0][0])).toContain('redis blip');
  });

  it('logs a failure event with no job attached', () => {
    const processor = new WhatsappWebhookProcessor(makeWebhook() as any);
    const error = jest
      .spyOn((processor as any).logger, 'error')
      .mockImplementation(() => undefined);

    processor.onFailed(undefined, new Error('worker gone'));

    expect(String(error.mock.calls[0][0])).toContain('unknown');
  });
});
