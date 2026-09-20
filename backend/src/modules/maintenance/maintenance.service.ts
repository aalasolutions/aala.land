import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { clampLimit, pageSkip } from '@shared/utils/pagination.util';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';
import {
  regionTimezoneSql,
  regionTodaySql,
} from '../../shared/utils/region-time.util';
import { Unit } from '../properties/entities/unit.entity';

const ARCHIVED_UNIT_LOCKED_MESSAGE =
  'This unit is archived. Its records can no longer be edited.';

export interface CostSummary {
  totalEstimated: number;
  totalActual: number;
  variance: number;
  workOrderCount: number;
  avgCostPerOrder: number;
  // Estimated cost still outstanding: everything not completed or cancelled.
  pendingCost: number;
}

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    private readonly dataSource: DataSource,
    private readonly recordHistoryService: RecordHistoryService,
  ) {}

  async create(
    companyId: string,
    dto: CreateWorkOrderDto,
    caller?: RegionScope,
  ): Promise<WorkOrder> {
    if (!dto.unitId) {
      throw new BadRequestException('Property is required for work orders');
    }
    await this.validateUnitOwnership(dto.unitId, companyId, caller, true);
    const regionCode = await this.regionOfUnit(dto.unitId, companyId);
    if (!regionCode) {
      throw new BadRequestException('Invalid unit selected');
    }

    const order = this.workOrderRepository.create({
      ...dto,
      companyId,
      regionCode,
    });
    return this.dataSource.transaction(async (manager) => {
      await this.assertUnitNotArchivedLocked(
        manager,
        order.unitId,
        companyId,
        'This unit is archived.',
      );
      return manager.getRepository(WorkOrder).save(order);
    });
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
    status?: string,
    period?: string,
    caller?: RegionScope,
  ) {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId });

    if (regionCodes) {
      qb.andWhere('wo.region_code IN (:...regionCodes)', { regionCodes });
    }

    if (status) {
      qb.andWhere('wo.status = :status', { status });
    }

    if (period) {
      // Period months are the work order's region months, not the server's.
      const zone = regionTimezoneSql('wo.region_code');
      const day = `COALESCE(wo.scheduled_date, (wo.created_at AT TIME ZONE ${zone})::date)`;
      const monthStart = `date_trunc('month', ${regionTodaySql('wo.region_code')})::date`;
      if (period === 'this_month') {
        qb.andWhere(
          `${day} >= ${monthStart} AND ${day} < (${monthStart} + interval '1 month')::date`,
        );
      } else if (period === 'last_month') {
        qb.andWhere(
          `${day} >= (${monthStart} - interval '1 month')::date AND ${day} < ${monthStart}`,
        );
      } else if (period === 'last_3_months') {
        qb.andWhere(`${day} >= (${monthStart} - interval '3 months')::date`);
      }
    }

    qb.skip(pageSkip(page, limit))
      .take(clampLimit(limit))
      .orderBy('wo.created_at', 'DESC');

    const [orders, total] = await qb.getManyAndCount();

    const orderIds = orders.map((o) => o.id);
    let unitMap: Record<
      string,
      { unitNumber: string; assetName: string; areaName: string }
    > = {};
    if (orderIds.length) {
      const unitInfo = await this.workOrderRepository.query(
        `SELECT wo.id AS "woId", u.unit_number AS "unitNumber", ast.name AS "assetName", loc.name AS "areaName"
         FROM work_orders wo
         LEFT JOIN units u ON wo.unit_id = u.id
         LEFT JOIN assets ast ON u.asset_id = ast.id
         LEFT JOIN localities loc ON ast.locality_id = loc.id
         WHERE wo.id = ANY($1)`,
        [orderIds],
      );
      unitMap = Object.fromEntries(
        unitInfo.map(
          (r: {
            woId: string;
            unitNumber: string;
            assetName: string;
            areaName: string;
          }) => [
            r.woId,
            {
              unitNumber: r.unitNumber,
              assetName: r.assetName,
              areaName: r.areaName,
            },
          ],
        ),
      );
    }

    const data = orders.map((o) => ({
      ...o,
      unitNumber: unitMap[o.id]?.unitNumber ?? null,
      assetName: unitMap[o.id]?.assetName ?? null,
      areaName: unitMap[o.id]?.areaName ?? null,
    }));

    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<WorkOrder> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Work order not found');
    }

    const order = await this.workOrderRepository.findOne({
      where: {
        id,
        companyId,
        ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
      },
    });
    if (!order) {
      throw new NotFoundException('Work order not found');
    }
    return order;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateWorkOrderDto,
    caller?: RegionScope,
    userId?: string,
  ): Promise<WorkOrder> {
    const order = await this.findOne(id, companyId, caller);
    const { reason, ...changes } = dto;
    const isStatusChange =
      changes.status !== undefined && changes.status !== order.status;

    if (
      isStatusChange &&
      changes.status === WorkOrderStatus.CANCELLED &&
      !reason?.trim()
    ) {
      throw new BadRequestException(
        'A reason is required to cancel a work order.',
      );
    }

    let regionCode: string | undefined;
    if (changes.unitId !== undefined) {
      if (!changes.unitId) {
        throw new BadRequestException('Property is required for work orders');
      }
      await this.validateUnitOwnership(
        changes.unitId,
        companyId,
        caller,
        changes.unitId !== order.unitId,
      );
      // The region follows the unit, so moving the work order moves the row.
      if (changes.unitId !== order.unitId) {
        regionCode = await this.regionOfUnit(changes.unitId, companyId);
        if (!regionCode) {
          throw new BadRequestException('Invalid unit selected');
        }
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WorkOrder);
      const locked = await repo.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Work order not found');
      }
      if (locked.unitId) {
        const unit = await manager.findOne(Unit, {
          where: { id: locked.unitId, companyId },
          select: { id: true, deletedAt: true },
          lock: { mode: 'pessimistic_read' },
        });
        if (unit?.deletedAt) {
          throw new ConflictException(ARCHIVED_UNIT_LOCKED_MESSAGE);
        }
      }
      if (changes.unitId && changes.unitId !== locked.unitId) {
        await this.assertUnitNotArchivedLocked(
          manager,
          changes.unitId,
          companyId,
          'This unit is archived.',
        );
      }
      const fromStatus = locked.status;
      Object.assign(locked, changes);
      if (regionCode) {
        locked.regionCode = regionCode;
      }
      if (changes.status === WorkOrderStatus.COMPLETED && !locked.completedAt) {
        locked.completedAt = new Date();
      }

      const saved = await repo.save(locked);
      if (locked.status !== fromStatus) {
        await this.recordWorkOrderHistory(
          manager,
          locked,
          locked.status === WorkOrderStatus.CANCELLED
            ? RecordHistoryAction.CANCEL
            : RecordHistoryAction.STATUS_CHANGE,
          userId,
          reason,
          { from: fromStatus, to: locked.status },
        );
      }
      return saved;
    });
  }

  async remove(
    id: string,
    companyId: string,
    reason: string,
    userId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Work order not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(WorkOrder, {
        where: {
          id,
          companyId,
          ...(scopedCodes ? { regionCode: In(scopedCodes) } : {}),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Work order not found');
      }
      const actualCost =
        order.actualCost == null ? 0 : Number(order.actualCost);
      if (
        order.status !== WorkOrderStatus.OPEN ||
        order.vendorId ||
        actualCost !== 0
      ) {
        throw new ConflictException('Cancel this work order instead.');
      }

      await this.recordWorkOrderHistory(
        manager,
        order,
        RecordHistoryAction.DELETE,
        userId,
        reason,
      );
      await manager.remove(order);
    });
  }

  private async recordWorkOrderHistory(
    manager: EntityManager,
    order: WorkOrder,
    action: RecordHistoryAction,
    userId: string | undefined,
    reason?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const unit = order.unitId
      ? await manager.findOne(Unit, {
          where: { id: order.unitId, companyId: order.companyId },
          select: { id: true, unitNumber: true },
        })
      : null;

    await this.recordHistoryService.record(manager, {
      companyId: order.companyId,
      action,
      entityType: 'WorkOrder',
      entityId: order.id,
      entityTitle: order.title,
      contextTitle: unit ? `Unit ${unit.unitNumber}` : null,
      reason: reason ?? null,
      actorId: userId ?? null,
      actorName: userId
        ? await this.recordHistoryService.resolveActorName(manager, userId)
        : 'System',
      regionCode: order.regionCode,
      metadata: metadata ?? null,
    });
  }

  async getCostSummary(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<CostSummary> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means nothing to total, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return {
        totalEstimated: 0,
        totalActual: 0,
        variance: 0,
        workOrderCount: 0,
        avgCostPerOrder: 0,
        pendingCost: 0,
      };
    }

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .select('COALESCE(SUM(wo.estimated_cost), 0)', 'totalEstimated')
      .addSelect('COALESCE(SUM(wo.actual_cost), 0)', 'totalActual')
      .addSelect('COUNT(*)::int', 'workOrderCount')
      .addSelect(
        `COALESCE(SUM(wo.estimated_cost) FILTER (WHERE wo.status NOT IN (:...settledStatuses)), 0)`,
        'pendingCost',
      )
      .where('wo.company_id = :companyId', { companyId })
      .setParameter('settledStatuses', [
        WorkOrderStatus.COMPLETED,
        WorkOrderStatus.CANCELLED,
      ]);

    if (regionCodes) {
      qb.andWhere('wo.region_code IN (:...regionCodes)', { regionCodes });
    }

    const result = await qb.getRawOne();

    const totalEstimated = parseFloat(result.totalEstimated);
    const totalActual = parseFloat(result.totalActual);
    const workOrderCount = parseInt(result.workOrderCount, 10);

    return {
      totalEstimated,
      totalActual,
      variance: totalEstimated - totalActual,
      workOrderCount,
      avgCostPerOrder: workOrderCount > 0 ? totalActual / workOrderCount : 0,
      pendingCost: parseFloat(result.pendingCost),
    };
  }

  async getUpcoming(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<WorkOrder[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return [];
    }

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId })
      .andWhere('wo.is_preventive = true')
      .andWhere(
        `wo.next_scheduled_date <= ${regionTodaySql('wo.region_code')} + 30`,
      )
      .orderBy('wo.next_scheduled_date', 'ASC');

    if (regionCodes) {
      qb.andWhere('wo.region_code IN (:...regionCodes)', { regionCodes });
    }

    return qb.take(100).getMany();
  }

  // A work order's region is its unit's, so a unit the caller cannot read must not be bound to one.
  private async validateUnitOwnership(
    unitId: string,
    companyId: string,
    caller?: RegionScope,
    rejectArchived = false,
  ): Promise<void> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new BadRequestException('Invalid unit selected');
    }

    const where: FindOptionsWhere<Unit> = { id: unitId, companyId };
    if (scopedCodes) {
      where.asset = { locality: { city: { regionCode: In(scopedCodes) } } };
    }

    const unit = await this.unitRepository.findOne({ where });
    if (!unit) {
      throw new BadRequestException('Invalid unit selected');
    }
    if (rejectArchived && unit.deletedAt) {
      throw new ConflictException('This unit is archived.');
    }
  }

  // FOR SHARE so archiveUnit cannot commit in between.
  private async assertUnitNotArchivedLocked(
    manager: EntityManager,
    unitId: string | null,
    companyId: string,
    message: string,
  ): Promise<void> {
    if (!unitId) {
      return;
    }
    const unit = await manager.findOne(Unit, {
      where: { id: unitId, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });
    if (!unit) {
      throw new BadRequestException('Invalid unit selected');
    }
    if (unit.deletedAt) {
      throw new ConflictException(message);
    }
  }

  private async regionOfUnit(
    unitId: string,
    companyId: string,
  ): Promise<string | undefined> {
    const row = await this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .select('ci.regionCode', 'regionCode')
      .where('u.id = :unitId', { unitId })
      .andWhere('u.companyId = :companyId', { companyId })
      .getRawOne<{ regionCode: string }>();
    return row?.regionCode ?? undefined;
  }
}
