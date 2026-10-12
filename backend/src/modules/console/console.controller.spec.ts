import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';
import { ChangePriceAmountDto, CreatePriceDto } from './dto/price.dto';

describe('ConsoleController', () => {
  const req = {
    user: { userId: 'op-1', email: 'operator@example.com' },
  } as never;
  let service: {
    createPrice: jest.Mock;
    changePriceAmount: jest.Mock;
    deactivatePrice: jest.Mock;
  };
  let controller: ConsoleController;

  beforeEach(() => {
    service = {
      createPrice: jest.fn().mockResolvedValue({ rows: [] }),
      changePriceAmount: jest.fn().mockResolvedValue({ rows: [] }),
      deactivatePrice: jest.fn().mockResolvedValue({ rows: [] }),
    };
    controller = new ConsoleController(service as unknown as ConsoleService);
  });

  it('guards every route with JWT and SUPER_ADMIN only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ConsoleController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(new Reflector().get<Role[]>(ROLES_KEY, ConsoleController)).toEqual([
      Role.SUPER_ADMIN,
    ]);
  });

  it('passes price writes through with the operator identity', async () => {
    const actor = { userId: 'op-1', email: 'operator@example.com' };
    const dto = { kind: 'SEAT' as const, currency: 'usd', unitAmount: 2500 };

    await controller.createPrice(dto, req);
    await controller.changePriceAmount('p-1', { unitAmount: 3000 }, req);
    await controller.deactivatePrice('p-1', req);

    expect(service.createPrice).toHaveBeenCalledWith(dto, actor);
    expect(service.changePriceAmount).toHaveBeenCalledWith(
      'p-1',
      { unitAmount: 3000 },
      actor,
    );
    expect(service.deactivatePrice).toHaveBeenCalledWith('p-1', actor);
  });

  it.each([
    [{ kind: 'SEAT', currency: 'usd', unitAmount: 2500 }, []],
    [{ kind: 'SEAT', currency: 'us', unitAmount: 2500 }, ['currency']],
    [{ kind: 'SEAT', currency: 'usd', unitAmount: 0 }, ['unitAmount']],
    [{ kind: 'SEAT', currency: 'usd', unitAmount: 2.5 }, ['unitAmount']],
    [{ kind: 'PRO', currency: 'usd', unitAmount: 2500 }, ['kind']],
    [
      { kind: 'SEAT', currency: 'usd', unitAmount: 2500, countryCodes: [] },
      ['countryCodes'],
    ],
    [
      {
        kind: 'SEAT',
        currency: 'usd',
        unitAmount: 2500,
        countryCodes: ['PK', 'PAK'],
      },
      ['countryCodes'],
    ],
    [
      { kind: 'SEAT', currency: 'usd', unitAmount: 2500, countryCodes: ['P1'] },
      ['countryCodes'],
    ],
    // Membership is the provider's list, checked in the service.
    [
      { kind: 'SEAT', currency: 'usd', unitAmount: 2500, countryCodes: ['XK'] },
      [],
    ],
    [
      { kind: 'SEAT', currency: 'usd', unitAmount: 2500, countryCodes: ['pk'] },
      [],
    ],
    [{ kind: 'SEAT', currency: 'usd', unitAmount: 100_000_000 }, []],
    [
      { kind: 'SEAT', currency: 'usd', unitAmount: 100_000_001 },
      ['unitAmount'],
    ],
  ])('validates CreatePriceDto %j', async (body, invalid) => {
    const errors = await validate(plainToInstance(CreatePriceDto, body));
    expect(errors.map((e) => e.property)).toEqual(invalid);
  });

  it.each([
    [{ unitAmount: 100_000_000 }, []],
    [{ unitAmount: 100_000_001 }, ['unitAmount']],
  ])('validates ChangePriceAmountDto %j', async (body, invalid) => {
    const errors = await validate(plainToInstance(ChangePriceAmountDto, body));
    expect(errors.map((e) => e.property)).toEqual(invalid);
  });
});
