import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateVendorDto } from './update-vendor.dto';

// The production config from main.ts. A field the DTO does not declare is not
// ignored here, it is rejected, which is what keeps a derived value derived.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const asBody = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: UpdateVendorDto });

describe('UpdateVendorDto', () => {
  it('rejects a currency, which the region decides and a client cannot set', async () => {
    await expect(asBody({ currency: 'USD' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects it whatever shape it takes, so this is not a validation gap', async () => {
    await expect(asBody({ currency: 'x' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(asBody({ currency: '' })).rejects.toThrow(BadRequestException);
  });

  it('still accepts the fields a vendor edit is for', async () => {
    await expect(
      asBody({ name: 'Acme Plumbing', hourlyRate: 120, isActive: false }),
    ).resolves.toEqual({
      name: 'Acme Plumbing',
      hourlyRate: 120,
      isActive: false,
    });
  });
});
