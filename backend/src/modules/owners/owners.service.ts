import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly ownerRepository: Repository<Owner>,
  ) {}

  async create(dto: CreateOwnerDto, companyId: string): Promise<Owner> {
    const owner = this.ownerRepository.create({ ...dto, companyId });
    return this.ownerRepository.save(owner);
  }

  async findAll(companyId: string, page = 1, limit = 20): Promise<{ data: Owner[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.ownerRepository.findAndCount({
      where: { companyId },
      relations: ['assignedAgent', 'units'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Owner> {
    const owner = await this.ownerRepository.findOne({
      where: { id, companyId },
      relations: ['assignedAgent', 'units', 'units.building', 'units.building.locality'],
    });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }
    return owner;
  }

  async update(id: string, companyId: string, dto: UpdateOwnerDto): Promise<Owner> {
    const owner = await this.findOne(id, companyId);
    Object.assign(owner, dto);
    return this.ownerRepository.save(owner);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const owner = await this.findOne(id, companyId);
    await this.ownerRepository.remove(owner);
  }
}
