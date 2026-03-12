import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lease, LeaseStatus } from './entities/lease.entity';
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
    regionCode?: string,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    if (regionCode) {
      const qb = this.leaseRepository
        .createQueryBuilder('l')
        .innerJoin('units', 'u', 'l.unit_id = u.id')
        .innerJoin('buildings', 'b', 'u.building_id = b.id')
        .innerJoin('property_areas', 'pa', 'b.area_id = pa.id')
        .where('l.company_id = :companyId', { companyId })
        .andWhere('pa.region_code = :regionCode', { regionCode })
        .skip((page - 1) * limit)
        .take(limit)
        .orderBy('l.created_at', 'DESC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

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

  async renew(id: string, companyId: string, dto: CreateLeaseDto): Promise<{ oldLease: Lease; newLease: Lease }> {
    const oldLease = await this.findOne(id, companyId);
    if (oldLease.status !== LeaseStatus.ACTIVE && oldLease.status !== LeaseStatus.EXPIRED) {
      throw new BadRequestException('Only ACTIVE or EXPIRED leases can be renewed');
    }
    oldLease.status = LeaseStatus.RENEWED;
    await this.leaseRepository.save(oldLease);

    const newLease = this.leaseRepository.create({ ...dto, companyId });
    const savedNewLease = await this.leaseRepository.save(newLease);

    return { oldLease, newLease: savedNewLease };
  }

  async terminate(id: string, companyId: string): Promise<Lease> {
    const lease = await this.findOne(id, companyId);
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE leases can be terminated');
    }
    lease.status = LeaseStatus.TERMINATED;
    return this.leaseRepository.save(lease);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const lease = await this.findOne(id, companyId);
    await this.leaseRepository.remove(lease);
  }
}
