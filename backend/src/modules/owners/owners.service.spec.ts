import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';
import { OwnersService } from './owners.service';

describe('OwnersService', () => {
  let service: OwnersService;
  let ownerRepo: jest.Mocked<Repository<Owner>>;

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
      ],
    }).compile();

    service = module.get<OwnersService>(OwnersService);
    ownerRepo = module.get(getRepositoryToken(Owner));
  });

  it('creates an owner when email and phone are unique within the company', async () => {
    ownerRepo.findOne.mockResolvedValue(null);
    ownerRepo.create.mockReturnValue(owner);
    ownerRepo.save.mockResolvedValue(owner);

    const result = await service.create(
      { name: 'Kadeem Orr', email: '  Kadeem@Example.com  ', phone: ' +971501234567 ' },
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
      service.create({ name: 'Another Owner', email: 'kadeem@example.com' }, companyId),
    ).rejects.toThrow(new ConflictException('An owner with this email already exists.'));

    expect(ownerRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId }),
    });
    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('rejects creating an owner with an existing phone in the same company', async () => {
    ownerRepo.findOne.mockResolvedValueOnce(owner);

    await expect(
      service.create({ name: 'Another Owner', phone: '+971501234567' }, companyId),
    ).rejects.toThrow(new ConflictException('An owner with this phone already exists.'));

    expect(ownerRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId, phone: '+971501234567' }),
    });
    expect(ownerRepo.save).not.toHaveBeenCalled();
  });

  it('rejects updating an owner to another owner email in the same company', async () => {
    ownerRepo.findOne
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce({ ...owner, id: 'owner-uuid-2' } as Owner);

    await expect(
      service.update('owner-uuid-1', companyId, { email: 'other@example.com' }),
    ).rejects.toThrow(new ConflictException('An owner with this email already exists.'));

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
    ).rejects.toThrow(new ConflictException('An owner with this phone already exists.'));

    expect(ownerRepo.save).not.toHaveBeenCalled();
  });
});
