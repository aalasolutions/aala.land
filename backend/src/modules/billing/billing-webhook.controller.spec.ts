import { Test, TestingModule } from '@nestjs/testing';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { BILLING_PROVIDER } from './provider/billing-provider.interface';

describe('BillingWebhookController', () => {
  let controller: BillingWebhookController;
  let service: { handleWebhook: jest.Mock };
  let provider: { signatureHeader: string };

  beforeEach(async () => {
    service = {
      handleWebhook: jest.fn().mockResolvedValue({ received: true }),
    };
    provider = { signatureHeader: 'stripe-signature' };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingWebhookController],
      providers: [
        { provide: BillingWebhookService, useValue: service },
        { provide: BILLING_PROVIDER, useValue: provider },
      ],
    }).compile();

    controller = module.get(BillingWebhookController);
  });

  it('passes rawBody and the stripe-signature header to the service', async () => {
    const rawBody = Buffer.from('payload');
    const req = {
      rawBody,
      headers: { 'stripe-signature': 't=1,v1=sig' },
    } as never;

    await expect(controller.handleWebhook(req)).resolves.toEqual({
      received: true,
    });
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBody, 't=1,v1=sig');
  });

  it('reads the header named by the active adapter', async () => {
    provider.signatureHeader = 'paddle-signature';
    const rawBody = Buffer.from('payload');
    const req = {
      rawBody,
      headers: {
        'stripe-signature': 't=1,v1=sig',
        'paddle-signature': 'ts=1;h1=abc',
      },
    } as never;

    await controller.handleWebhook(req);
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBody, 'ts=1;h1=abc');
  });

  it('forwards a missing signature header as undefined', async () => {
    const rawBody = Buffer.from('payload');
    const req = { rawBody, headers: {} } as never;
    await controller.handleWebhook(req);
    expect(service.handleWebhook).toHaveBeenCalledWith(rawBody, undefined);
  });

  it('forwards an undefined rawBody so the service can reject it', async () => {
    service.handleWebhook.mockRejectedValue(
      new Error('Missing webhook payload or signature'),
    );
    const req = {
      rawBody: undefined,
      headers: { 'stripe-signature': 't=1,v1=sig' },
    } as never;
    await expect(controller.handleWebhook(req)).rejects.toThrow(
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
