import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeaseDto } from './create-lease.dto';
import { UpdateLeaseDto } from './update-lease.dto';

const base = {
  unitId: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 1000,
};

async function errorsFor(
  cls: new () => object,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

describe('lease DTO number of cheques', () => {
  it('rejects null on create and update', async () => {
    expect(
      await errorsFor(CreateLeaseDto, { ...base, numberOfCheques: null }),
    ).toContain('numberOfCheques');
    expect(
      await errorsFor(UpdateLeaseDto, { numberOfCheques: null }),
    ).toContain('numberOfCheques');
  });

  it('allows it to be left out, so the default applies', async () => {
    expect(await errorsFor(CreateLeaseDto, base)).not.toContain(
      'numberOfCheques',
    );
  });
});
