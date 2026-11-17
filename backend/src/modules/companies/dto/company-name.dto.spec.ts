import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCompanyDto } from './update-company.dto';
import { CreateCompanyDto } from './create-company.dto';

const nameErrors = async (body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(UpdateCompanyDto, body));
  return errors.filter((e) => e.property === 'name');
};

describe('company name validation', () => {
  it.each([[''], ['   '], [null]])('rejects %p on update', async (name) => {
    expect(await nameErrors({ name })).toHaveLength(1);
  });

  it('accepts a valid name and trims it', async () => {
    const dto = plainToInstance(UpdateCompanyDto, { name: '  Acme  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Acme');
  });

  it('accepts an update that omits the name', async () => {
    expect(await nameErrors({ isActive: true })).toHaveLength(0);
  });

  it('rejects a whitespace-only name on create', async () => {
    const errors = await validate(
      plainToInstance(CreateCompanyDto, {
        name: '   ',
        slug: 'acme',
        defaultRegionCode: 'punjab',
      }),
    );
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
