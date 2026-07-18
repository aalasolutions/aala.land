import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';
import { Unit } from '../properties/entities/unit.entity';
import { OwnersService } from './owners.service';

describe('OwnersService', () => {
  let service: OwnersService;
  let ownerRepo: jest.Mocked<Repository<Owner>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;

  const companyId = 'company-uuid-1';
  const owner = {
    id: 'owner-uuid-1',
    name: 'Kadeem Orr',
    email: 'kadeem@example.com',
    phone: '+971501234567',
    companyId,
  } as Owner;

  function createRepositoryMock<T extends object>() {
    return {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<T>>;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnersService,
        {
          provide: getRepositoryToken(Owner),
          useValue: createRepositoryMock<Owner>(),
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: createRepositoryMock<Unit>(),
        },
      ],
    }).compile();

    service = module.get<OwnersService>(OwnersService);
    ownerRepo = module.get(getRepositoryToken(Owner));
    unitRepo = module.get(getRepositoryToken(Unit));
  });

  it('creates an owner when email and phone are unique within the company', async () => {
    ownerRepo.findOne.mockResolvedValue(null);
    ownerRepo.create.mockReturnValue(owner);
    ownerRepo.save.mockResolvedValue(owner);

    const result = await service.create(
      {
        name: 'Kadeem Orr',
        email: '  Kadeem@Example.com  ',
        phone: ' +971501234567 ',
      },
      companyId,
    );

    expect(ownerRepo.create).toHaveBeenCalledWith({
      name: 'Kadeem Orr',
      email: 'kadeem@example.com',
      phone: '+971501234567',
      companyId,
    });
    expect(result).toEqual(owner);
  });

  it('rejects creating an owner with an existing email in the same company', async () => {
    ownerRepo.findOne.mockResolvedValueOnce(owner);

    await expect(
      service.create(
        { name: 'Another Owner', email: 'kadeem@example.com' },
        companyId,
      ),
    ).rejects.toThrow(
      new ConflictException('An owner with this email already exists.'),
    );

    expect(ownerRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId }),
    });
    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('rejects creating an owner with an existing phone in the same company', async () => {
    ownerRepo.findOne.mockResolvedValueOnce(owner);

    await expect(
      service.create(
        { name: 'Another Owner', phone: '+971501234567' },
        companyId,
      ),
    ).rejects.toThrow(
      new ConflictException('An owner with this phone already exists.'),
    );

    expect(ownerRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId, phone: expect.anything() }),
    });
    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('maps raced email unique violations to conflict errors', async () => {
    const uniqueViolation = new QueryFailedError('INSERT INTO owners ...', [], {
      code: '23505',
      constraint: 'IDX_owners_company_normalized_email_unique',
    } as unknown as Error);

    ownerRepo.findOne.mockResolvedValue(null);
    ownerRepo.create.mockReturnValue(owner);
    ownerRepo.save.mockRejectedValue(uniqueViolation);

    await expect(
      service.create(
        { name: 'Kadeem Orr', email: 'kadeem@example.com' },
        companyId,
      ),
    ).rejects.toThrow(
      new ConflictException('An owner with this email already exists.'),
    );
  });

  it('maps raced phone unique violations to conflict errors', async () => {
    const uniqueViolation = new QueryFailedError('INSERT INTO owners ...', [], {
      code: '23505',
      constraint: 'IDX_owners_company_normalized_phone_unique',
    } as unknown as Error);

    ownerRepo.findOne.mockResolvedValue(null);
    ownerRepo.create.mockReturnValue(owner);
    ownerRepo.save.mockRejectedValue(uniqueViolation);

    await expect(
      service.create({ name: 'Kadeem Orr', phone: '+971501234567' }, companyId),
    ).rejects.toThrow(
      new ConflictException('An owner with this phone already exists.'),
    );
  });

  it('rejects updating an owner to another owner email in the same company', async () => {
    ownerRepo.findOne
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce({ ...owner, id: 'owner-uuid-2' } as Owner);

    await expect(
      service.update('owner-uuid-1', companyId, { email: 'other@example.com' }),
    ).rejects.toThrow(
      new ConflictException('An owner with this email already exists.'),
    );

    expect(ownerRepo.findOne).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ companyId, id: expect.anything() }),
    });
    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('rejects updating an owner to another owner phone in the same company', async () => {
    ownerRepo.findOne
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce({ ...owner, id: 'owner-uuid-2' } as Owner);

    await expect(
      service.update('owner-uuid-1', companyId, { phone: '+971501234567' }),
    ).rejects.toThrow(
      new ConflictException('An owner with this phone already exists.'),
    );

    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when removing an unknown owner', async () => {
    ownerRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('missing-owner', companyId)).rejects.toThrow(
      new NotFoundException('Owner not found'),
    );

    expect(unitRepo.count).not.toHaveBeenCalled();
    expect(ownerRepo.remove).not.toHaveBeenCalled();
  });

  it('rejects deleting an owner with linked units', async () => {
    ownerRepo.findOne.mockResolvedValue(owner);
    unitRepo.count.mockResolvedValue(2);

    await expect(service.remove(owner.id, companyId)).rejects.toThrow(
      new BadRequestException(
        'Cannot delete owner — 2 unit(s) are still linked. Unlink them first.',
      ),
    );

    expect(unitRepo.count).toHaveBeenCalledWith({
      where: { ownerId: owner.id, companyId },
    });
    expect(ownerRepo.remove).not.toHaveBeenCalled();
  });

  it('removes an owner when no units are linked', async () => {
    ownerRepo.findOne.mockResolvedValue(owner);
    unitRepo.count.mockResolvedValue(0);
    ownerRepo.remove.mockResolvedValue(owner);

    await service.remove(owner.id, companyId);

    expect(ownerRepo.remove).toHaveBeenCalledWith(owner);
  });

  it('maps a foreign key violation on removal to a BadRequestException', async () => {
    ownerRepo.findOne.mockResolvedValue(owner);
    unitRepo.count.mockResolvedValue(0);
    const fkViolation = new QueryFailedError('DELETE FROM owners ...', [], {
      code: '23503',
    } as unknown as Error);
    ownerRepo.remove.mockRejectedValue(fkViolation);

    await expect(service.remove(owner.id, companyId)).rejects.toThrow(
      new BadRequestException(
        'Cannot delete owner — one or more units are still linked. Unlink them first.',
      ),
    );
  });

  it('rethrows unexpected errors encountered while removing an owner', async () => {
    ownerRepo.findOne.mockResolvedValue(owner);
    unitRepo.count.mockResolvedValue(0);
    const unexpectedError = new Error('connection lost');
    ownerRepo.remove.mockRejectedValue(unexpectedError);

    await expect(service.remove(owner.id, companyId)).rejects.toThrow(
      unexpectedError,
    );
  });
});
