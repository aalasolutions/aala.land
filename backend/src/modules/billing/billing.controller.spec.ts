import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartCheckoutDto } from './billing.controller';

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(StartCheckoutDto, body));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('StartCheckoutDto', () => {
  const urls = {
    successUrl: 'http://localhost:4200/company?tab=billing',
    cancelUrl: 'http://localhost:4200/company?tab=billing',
  };

  it('accepts a checkout with the refund terms accepted', async () => {
    await expect(
      errorsFor({ ...urls, refundTermsAccepted: true }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['the string true', 'true'],
    ['1', 1],
  ])(
    'refuses refundTermsAccepted %s with a clear message',
    async (_, value) => {
      await expect(
        errorsFor({ ...urls, refundTermsAccepted: value }),
      ).resolves.toEqual([
        'refundTermsAccepted must be true: accept the refund terms to subscribe',
      ]);
    },
  );
});
