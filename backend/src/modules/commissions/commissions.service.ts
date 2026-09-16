import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  In,
  DataSource,
  EntityManager,
} from 'typeorm';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Commission, CommissionStatus } from './entities/commission.entity';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { paginationOptions } from '../../shared/utils/pagination.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';

@Injectable()
export class CommissionsService {
  constructor(
    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly recordHistoryService: RecordHistoryService,
  ) {}

  async create(
    companyId: string,
    dto: CreateCommissionDto,
    caller?: RegionScope,
  ): Promise<Commission> {
    const agent = await this.userRepository.findOne({
      where: { id: dto.agentId, companyId },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    const commissionAmount = (dto.grossAmount * dto.commissionRate) / 100;
    const regionCode = await resolveRegionCode(
      this.companyRepository,
      companyId,
      dto.regionCode,
      caller,
    );

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
    caller?: RegionScope,
  ): Promise<{
    data: Commission[];
    total: number;
    page: number;
    limit: number;
  }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const where: FindOptionsWhere<Commission> = { companyId };
    if (status) where.status = status as CommissionStatus;
    if (regionCodes) where.regionCode = In(regionCodes);

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
    caller?: RegionScope,
  ): Promise<{
    data: Commission[];
    total: number;
    page: number;
    limit: number;
  }> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no rows, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const where: FindOptionsWhere<Commission> = { agentId, companyId };
    if (scopedCodes) where.regionCode = In(scopedCodes);

    const [data, total] = await this.commissionRepository.findAndCount({
      where,
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  private regionScopedWhere(
    caller?: RegionScope,
  ): FindOptionsWhere<Commission> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Commission not found');
    }
    return scopedCodes ? { regionCode: In(scopedCodes) } : {};
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Commission> {
    const commission = await this.commissionRepository.findOne({
      where: { id, companyId, ...this.regionScopedWhere(caller) },
    });
    if (!commission) {
      throw new NotFoundException('Commission not found');
    }
    return commission;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateCommissionDto,
    caller?: RegionScope,
    userId?: string,
  ): Promise<Commission> {
    // Confirm existence + tenant scope, and give a NotFound (not a silent no-op) for a bad id.
    const commission = await this.findOne(id, companyId, caller);
    const isStatusChange =
      dto.status !== undefined && dto.status !== commission.status;

    if (
      isStatusChange &&
      dto.status === CommissionStatus.CANCELLED &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required to cancel a commission.',
      );
    }
    if (isStatusChange) {
      this.assertPatchTransition(commission.status, dto.status!);
    }

    // Persist only DTO-changed columns so a concurrent approve/pay transition isn't clobbered.
    const patch: QueryDeepPartialEntity<Commission> = {};
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.notes !== undefined) patch.notes = dto.notes;

    if (Object.keys(patch).length > 0) {
      await this.dataSource.transaction(async (manager) => {
        const result = await manager
          .getRepository(Commission)
          .update(
            isStatusChange
              ? { id, companyId, status: commission.status }
              : { id, companyId },
            patch,
          );
        if (result.affected !== 1) {
          throw new ConflictException(
            'This commission was changed by someone else. Refresh and try again.',
          );
        }

        if (isStatusChange) {
          await this.recordCommissionHistory(
            manager,
            commission,
            dto.status === CommissionStatus.CANCELLED
              ? RecordHistoryAction.CANCEL
              : RecordHistoryAction.STATUS_CHANGE,
            userId,
            dto.reason,
            { from: commission.status, to: dto.status },
          );
        }
      });
    }

    // Re-read of a row this caller just wrote, so it stays unscoped.
    return this.findOne(id, companyId);
  }

  async approve(
    id: string,
    companyId: string,
    caller?: RegionScope,
    userId?: string,
  ): Promise<Commission> {
    const regionWhere = this.regionScopedWhere(caller);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Commission);
      // Guarded conditional transition: only flips PENDING -> APPROVED atomically.
      const result = await repo.update(
        { id, companyId, status: CommissionStatus.PENDING, ...regionWhere },
        { status: CommissionStatus.APPROVED },
      );

      if (result.affected !== 1) {
        await this.assertExists(id, companyId, caller);
        throw new ConflictException('Only PENDING commissions can be approved');
      }

      await this.recordTransitionHistory(
        manager,
        id,
        companyId,
        CommissionStatus.PENDING,
        CommissionStatus.APPROVED,
        userId,
      );
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
    return this.findOne(id, companyId);
  }

  async pay(
    id: string,
    companyId: string,
    caller?: RegionScope,
    userId?: string,
  ): Promise<Commission> {
    const regionWhere = this.regionScopedWhere(caller);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Commission);
      // Guarded conditional transition: flips APPROVED to PAID and stamps paidAt in one statement.
      const result = await repo.update(
        { id, companyId, status: CommissionStatus.APPROVED, ...regionWhere },
        { status: CommissionStatus.PAID, paidAt: new Date() },
      );

      if (result.affected !== 1) {
        await this.assertExists(id, companyId, caller);
        throw new ConflictException(
          'Only APPROVED commissions can be marked as paid',
        );
      }

      await this.recordTransitionHistory(
        manager,
        id,
        companyId,
        CommissionStatus.APPROVED,
        CommissionStatus.PAID,
        userId,
      );
    });

    // Re-read of a row this caller just wrote, so it stays unscoped.
    return this.findOne(id, companyId);
  }

  private async recordTransitionHistory(
    manager: EntityManager,
    id: string,
    companyId: string,
    from: CommissionStatus,
    to: CommissionStatus,
    userId: string | undefined,
  ): Promise<void> {
    const commission = await manager
      .getRepository(Commission)
      .findOne({ where: { id, companyId } });
    if (!commission) {
      throw new NotFoundException('Commission not found');
    }
    await this.recordCommissionHistory(
      manager,
      commission,
      RecordHistoryAction.STATUS_CHANGE,
      userId,
      null,
      { from, to },
    );
  }

  private async recordCommissionHistory(
    manager: EntityManager,
    commission: Commission,
    action: RecordHistoryAction,
    userId: string | undefined,
    reason: string | null | undefined,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.recordHistoryService.record(manager, {
      companyId: commission.companyId,
      action,
      entityType: 'Commission',
      entityId: commission.id,
      entityTitle: `Commission ${commission.commissionAmount} ${commission.currency}`,
      contextTitle: await this.agentName(
        manager,
        commission.agentId,
        commission.companyId,
      ),
      reason: reason ?? null,
      actorId: userId ?? null,
      actorName: userId
        ? await this.recordHistoryService.resolveActorName(manager, userId)
        : 'System',
      regionCode: commission.regionCode,
      metadata,
    });
  }

  // PATCH only cancels or un-approves; approve and pay have their own guarded routes.
  private assertPatchTransition(
    from: CommissionStatus,
    to: CommissionStatus,
  ): void {
    if (from === CommissionStatus.PAID) {
      throw new ConflictException(
        'A paid commission is final. Record a clawback instead.',
      );
    }
    const cancel =
      to === CommissionStatus.CANCELLED &&
      (from === CommissionStatus.PENDING || from === CommissionStatus.APPROVED);
    const unapprove =
      to === CommissionStatus.PENDING && from === CommissionStatus.APPROVED;
    if (!cancel && !unapprove) {
      throw new ConflictException(
        `A ${from} commission cannot be changed to ${to} here. Use Approve or Mark Paid.`,
      );
    }
  }

  private async agentName(
    manager: EntityManager,
    agentId: string,
    companyId: string,
  ): Promise<string | null> {
    const agent = await manager.findOne(User, {
      where: { id: agentId, companyId },
      select: { id: true, name: true, email: true },
    });
    return agent?.name?.trim() || agent?.email || null;
  }

  private async assertExists(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const exists = await this.commissionRepository.findOne({
      where: { id, companyId, ...this.regionScopedWhere(caller) },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Commission not found');
    }
  }

  async getSummary(
    agentId: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<{
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
    count: number;
  }> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means nothing to total, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return { totalEarned: 0, totalPaid: 0, totalPending: 0, count: 0 };
    }

    const qb = this.commissionRepository
      .createQueryBuilder('c')
      .select(
        'COALESCE(SUM(CASE WHEN c.status <> :cancelled THEN c.commissionAmount ELSE 0 END), 0)',
        'totalEarned',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN c.status = :paid THEN c.commissionAmount ELSE 0 END), 0)',
        'totalPaid',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN c.status IN (:...pending) THEN c.commissionAmount ELSE 0 END), 0)',
        'totalPending',
      )
      .addSelect('COUNT(c.id)', 'count')
      .where('c.agentId = :agentId', { agentId })
      .andWhere('c.companyId = :companyId', { companyId })
      .setParameters({
        cancelled: CommissionStatus.CANCELLED,
        paid: CommissionStatus.PAID,
        pending: [CommissionStatus.PENDING, CommissionStatus.APPROVED],
      });

    if (scopedCodes) {
      qb.andWhere('c.regionCode IN (:...regionCodes)', {
        regionCodes: scopedCodes,
      });
    }

    const result = await qb.getRawOne();

    return {
      totalEarned: Number(result.totalEarned),
      totalPaid: Number(result.totalPaid),
      totalPending: Number(result.totalPending),
      count: Number(result.count),
    };
  }
}
