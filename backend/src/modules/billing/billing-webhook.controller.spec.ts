import { Test, TestingModule } from '@nestjs/testing';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';

describe('BillingWebhookController', () => {
  let controller: BillingWebhookController;
  let service: { handleWebhook: jest.Mock };

  beforeEach(async () => {
    service = {
      handleWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingWebhookController],
      providers: [{ provide: BillingWebhookService, useValue: service }],
    }).compile();

    controller = module.get(BillingWebhookController);
  });

  it('passes rawBody and the stripe-signature header to the service', async () => {
    const rawBody = Buffer.from('payload');
    const req = { rawBody } as never;

    await expect(controller.handleWebhook(req, 't=1,v1=sig')).resolves.toEqual({
      received: true,
    });
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBody, 't=1,v1=sig');
  });

  it('forwards an undefined rawBody so the service can reject it', async () => {
    service.handleWebhook.mockRejectedValue(
      new Error('Missing webhook payload or signature'),
    );
    const req = { rawBody: undefined } as never;
    await expect(controller.handleWebhook(req, 't=1,v1=sig')).rejects.toThrow(
      'Missing webhook payload or signature',
    );
    expect(service.handleWebhook).toHaveBeenCalledWith(undefined, 't=1,v1=sig');
  });

  it('has no guards on the webhook route (public by design)', () => {
    const methodGuards = Reflect.getMetadata(
      '__guards__',
      BillingWebhookController.prototype.handleWebhook,
    );
    const classGuards = Reflect.getMetadata(
      '__guards__',
      BillingWebhookController,
    );
    expect(methodGuards).toBeUndefined();
    expect(classGuards).toBeUndefined();
  });
});
