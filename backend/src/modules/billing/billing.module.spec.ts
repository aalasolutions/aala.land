import { ConfigService } from '@nestjs/config';
import { billingProviderFactory } from './billing.module';
import { PaddleBillingProvider } from './provider/paddle-billing.provider';
import { StripeBillingProvider } from './provider/stripe-billing.provider';

function configWith(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

describe('billingProviderFactory', () => {
  it('defaults to Stripe when BILLING_PROVIDER is unset or empty', () => {
    for (const value of [undefined, '', '  ']) {
      const provider = billingProviderFactory(
        configWith({ BILLING_PROVIDER: value, STRIPE_SECRET_KEY: 'sk_test' }),
      );
      expect(provider).toBeInstanceOf(StripeBillingProvider);
    }
  });

  it('selects Paddle without requiring Stripe keys', () => {
    const provider = billingProviderFactory(
      configWith({ BILLING_PROVIDER: 'Paddle', PADDLE_API_KEY: 'key' }),
    );
    expect(provider).toBeInstanceOf(PaddleBillingProvider);
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      billingProviderFactory(configWith({ BILLING_PROVIDER: 'other' })),
    ).toThrow('Unsupported BILLING_PROVIDER "other"');
  });
});
