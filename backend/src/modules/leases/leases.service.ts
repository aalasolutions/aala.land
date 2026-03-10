import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lease } from './entities/lease.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
  ) { }

  async create(companyId: string, dto: CreateLeaseDto): Promise<Lease> {
    const lease = this.leaseRepository.create({ ...dto, companyId });
    return this.leaseRepository.save(lease);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.leaseRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Lease> {
    const lease = await this.leaseRepository.findOne({ where: { id, companyId } });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  async findByUnit(unitId: string, companyId: string): Promise<Lease[]> {
    return this.leaseRepository.find({
      where: { unitId, companyId },
      order: { startDate: 'DESC' },
    });
  }

  async update(id: string, companyId: string, dto: UpdateLeaseDto): Promise<Lease> {
    const lease = await this.findOne(id, companyId);
    Object.assign(lease, dto);
    return this.leaseRepository.save(lease);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const lease = await this.findOne(id, companyId);
    await this.leaseRepository.remove(lease);
  }
}
