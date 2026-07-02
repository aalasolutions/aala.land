import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Raw, Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly ownerRepository: Repository<Owner>,
  ) {}

  async create(dto: CreateOwnerDto, companyId: string): Promise<Owner> {
    const ownerData = this.sanitizeOwnerInput(dto);

    await this.ensureNoDuplicateOwner(companyId, ownerData);

    const owner = this.ownerRepository.create({ ...ownerData, companyId });
    return this.ownerRepository.save(owner);
  }

  async findAll(companyId: string, page = 1, limit = 20): Promise<{ data: Owner[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.ownerRepository.findAndCount({
      where: { companyId },
      relations: ['assignedAgent', 'units'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Owner> {
    const owner = await this.ownerRepository.findOne({
      where: { id, companyId },
      relations: ['assignedAgent', 'units', 'units.asset', 'units.asset.locality'],
    });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
    return owner;
  }

  async update(id: string, companyId: string, dto: UpdateOwnerDto): Promise<Owner> {
    const owner = await this.findOne(id, companyId);
    const ownerData = this.sanitizeOwnerInput(dto);

    await this.ensureNoDuplicateOwner(companyId, ownerData, id);

    Object.assign(owner, ownerData);
    return this.ownerRepository.save(owner);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const owner = await this.findOne(id, companyId);
    await this.ownerRepository.remove(owner);
  }

  private sanitizeOwnerInput<T extends CreateOwnerDto | UpdateOwnerDto>(dto: T): T {
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();

    return {
      ...dto,
      ...(dto.email !== undefined ? { email: email || undefined } : {}),
      ...(dto.phone !== undefined ? { phone: phone || undefined } : {}),
    };
  }

  private async ensureNoDuplicateOwner(companyId: string, dto: CreateOwnerDto | UpdateOwnerDto, excludeId?: string): Promise<void> {
    if (dto.email) {
      const duplicate = await this.ownerRepository.findOne({
        where: {
          companyId,
          email: Raw((alias) => `LOWER(${alias}) = :email`, { email: dto.email }),
          ...(excludeId ? { id: Not(excludeId) } : {}),
        },
      });
      if (duplicate) {
        throw new ConflictException('An owner with this email already exists.');
      }
    }

    if (dto.phone) {
      const duplicate = await this.ownerRepository.findOne({
        where: {
          companyId,
          phone: dto.phone,
          ...(excludeId ? { id: Not(excludeId) } : {}),
        },
      });
      if (duplicate) {
        throw new ConflictException('An owner with this phone already exists.');
      }
    }
  }
}
