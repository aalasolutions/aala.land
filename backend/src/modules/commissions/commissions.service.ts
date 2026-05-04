import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Commission, CommissionStatus } from './entities/commission.entity';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { Company } from '../companies/entities/company.entity';
import { resolveRegionCode } from '../../shared/utils/resolve-region-code.util';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class CommissionsService {
  constructor(
    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) { }

  async create(companyId: string, dto: CreateCommissionDto): Promise<Commission> {
    const commissionAmount = (dto.grossAmount * dto.commissionRate) / 100;
    const regionCode = await resolveRegionCode(this.companyRepository, companyId, dto.regionCode);

    const commission = this.commissionRepository.create({
      ...dto,
      companyId,
      commissionAmount,
      regionCode,
    });
    return this.commissionRepository.save(commission);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    status?: string,
    regionCode?: string,
  ): Promise<{ data: Commission[]; total: number; page: number; limit: number }> {
    const where: FindOptionsWhere<Commission> = { companyId };
    if (status) where.status = status as CommissionStatus;
    if (regionCode) where.regionCode = regionCode;

    const [data, total] = await this.commissionRepository.findAndCount({
      where,
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findByAgent(
    agentId: string,
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Commission[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.commissionRepository.findAndCount({
      where: { agentId, companyId },
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Commission> {
    const commission = await this.commissionRepository.findOne({ where: { id, companyId } });
    if (!commission) {
      throw new NotFoundException('Commission not found');
    }
    return commission;
  }

  async update(id: string, companyId: string, dto: UpdateCommissionDto): Promise<Commission> {
    const commission = await this.findOne(id, companyId);
    Object.assign(commission, dto);

    if (dto.status === CommissionStatus.PAID && !commission.paidAt) {
      commission.paidAt = new Date();
    }

    return this.commissionRepository.save(commission);
  }

  async approve(id: string, companyId: string): Promise<Commission> {
    const commission = await this.findOne(id, companyId);
    if (commission.status !== CommissionStatus.PENDING) {
      throw new BadRequestException('Only PENDING commissions can be approved');
    }
    commission.status = CommissionStatus.APPROVED;
    return this.commissionRepository.save(commission);
  }

  async pay(id: string, companyId: string): Promise<Commission> {
    const commission = await this.findOne(id, companyId);
    if (commission.status !== CommissionStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED commissions can be marked as paid');
    }
    commission.status = CommissionStatus.PAID;
    commission.paidAt = new Date();
    return this.commissionRepository.save(commission);
  }

  async getSummary(agentId: string, companyId: string): Promise<{
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
    count: number;
  }> {
    const result = await this.commissionRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.commissionAmount), 0)', 'totalEarned')
      .addSelect(
        "COALESCE(SUM(CASE WHEN c.status = :paid THEN c.commissionAmount ELSE 0 END), 0)",
        'totalPaid'
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN c.status IN (:...pending) THEN c.commissionAmount ELSE 0 END), 0)",
        'totalPending'
      )
      .addSelect('COUNT(c.id)', 'count')
      .where('c.agentId = :agentId', { agentId })
      .andWhere('c.companyId = :companyId', { companyId })
      .setParameters({ paid: CommissionStatus.PAID, pending: [CommissionStatus.PENDING, CommissionStatus.APPROVED] })
      .getRawOne();

    return {
      totalEarned: Number(result.totalEarned),
      totalPaid: Number(result.totalPaid),
      totalPending: Number(result.totalPending),
      count: Number(result.count),
    };
  }
}
