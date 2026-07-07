import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
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
    // Confirm existence + tenant scope, and give a NotFound (not a silent no-op) for a bad id.
    const commission = await this.findOne(id, companyId);

    // Only persist the columns this DTO can change, so a concurrent state
    // transition (approve/pay) is not clobbered by a stale whole-entity save.
    const patch: QueryDeepPartialEntity<Commission> = {};
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.status === CommissionStatus.PAID && !commission.paidAt) {
      patch.paidAt = new Date();
    }

    if (Object.keys(patch).length > 0) {
      await this.commissionRepository.update({ id, companyId }, patch);
    }

    return this.findOne(id, companyId);
  }

  async approve(id: string, companyId: string): Promise<Commission> {
    // Guarded conditional transition: only flips PENDING -> APPROVED atomically.
    const result = await this.commissionRepository.update(
      { id, companyId, status: CommissionStatus.PENDING },
      { status: CommissionStatus.APPROVED },
    );

    if (result.affected !== 1) {
      await this.assertExists(id, companyId);
      throw new ConflictException('Only PENDING commissions can be approved');
    }

    return this.findOne(id, companyId);
  }

  async pay(id: string, companyId: string): Promise<Commission> {
    // Guarded conditional transition: only flips APPROVED -> PAID atomically,
    // stamping paidAt in the same statement so amount edits cannot be clobbered.
    const result = await this.commissionRepository.update(
      { id, companyId, status: CommissionStatus.APPROVED },
      { status: CommissionStatus.PAID, paidAt: new Date() },
    );

    if (result.affected !== 1) {
      await this.assertExists(id, companyId);
      throw new ConflictException('Only APPROVED commissions can be marked as paid');
    }

    return this.findOne(id, companyId);
  }

  private async assertExists(id: string, companyId: string): Promise<void> {
    const exists = await this.commissionRepository.findOne({
      where: { id, companyId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Commission not found');
    }
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
