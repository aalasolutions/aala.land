import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';
import { Unit } from '../properties/entities/unit.entity';

export interface CostSummary {
  totalEstimated: number;
  totalActual: number;
  variance: number;
  workOrderCount: number;
  avgCostPerOrder: number;
}

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
  ) {}

  async create(
    companyId: string,
    dto: CreateWorkOrderDto,
    caller?: RegionScope,
  ): Promise<WorkOrder> {
    if (!dto.unitId) {
      throw new BadRequestException('Property is required for work orders');
    }
    await this.validateUnitOwnership(dto.unitId, companyId, caller);
    const regionCode = await this.regionOfUnit(dto.unitId, companyId);
    if (!regionCode) {
      throw new BadRequestException('Invalid unit selected');
    }

    const order = this.workOrderRepository.create({
      ...dto,
      companyId,
      regionCode,
    });
    return this.workOrderRepository.save(order);
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

    const now = new Date();
    if (period === 'this_month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      qb.andWhere(
        'COALESCE(wo.scheduled_date, wo.created_at) >= :monthStart AND COALESCE(wo.scheduled_date, wo.created_at) < :nextMonthStart',
        { monthStart, nextMonthStart },
      );
    } else if (period === 'last_month') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      qb.andWhere(
        'COALESCE(wo.scheduled_date, wo.created_at) >= :lastMonthStart AND COALESCE(wo.scheduled_date, wo.created_at) < :thisMonthStart',
        { lastMonthStart, thisMonthStart },
      );
    } else if (period === 'last_3_months') {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      qb.andWhere(
        'COALESCE(wo.scheduled_date, wo.created_at) >= :threeMonthsAgo',
        {
          threeMonthsAgo,
        },
      );
    }

    qb.skip((page - 1) * limit)
      .take(limit)
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
  ): Promise<WorkOrder> {
    const order = await this.findOne(id, companyId, caller);
    if (dto.unitId !== undefined) {
      if (!dto.unitId) {
        throw new BadRequestException('Property is required for work orders');
      }
      await this.validateUnitOwnership(dto.unitId, companyId, caller);
      // The region follows the unit, so moving the work order moves the row.
      if (dto.unitId !== order.unitId) {
        const regionCode = await this.regionOfUnit(dto.unitId, companyId);
        if (!regionCode) {
          throw new BadRequestException('Invalid unit selected');
        }
        order.regionCode = regionCode;
      }
    }
    Object.assign(order, dto);

    if (dto.status === WorkOrderStatus.COMPLETED && !order.completedAt) {
      order.completedAt = new Date();
    }

    return this.workOrderRepository.save(order);
  }

  async remove(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const order = await this.findOne(id, companyId, caller);
    await this.workOrderRepository.remove(order);
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
      };
    }

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .select('COALESCE(SUM(wo.estimated_cost), 0)', 'totalEstimated')
      .addSelect('COALESCE(SUM(wo.actual_cost), 0)', 'totalActual')
      .addSelect('COUNT(*)::int', 'workOrderCount')
      .where('wo.company_id = :companyId', { companyId });

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

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId })
      .andWhere('wo.is_preventive = true')
      .andWhere('wo.next_scheduled_date <= :thirtyDays', {
        thirtyDays: thirtyDaysFromNow,
      })
      .orderBy('wo.next_scheduled_date', 'ASC');

    if (regionCodes) {
      qb.andWhere('wo.region_code IN (:...regionCodes)', { regionCodes });
    }

    return qb.take(100).getMany();
  }

  // A work order's region is its unit's, so a unit the caller cannot read must
  // not be bound to one.
  private async validateUnitOwnership(
    unitId: string,
    companyId: string,
    caller?: RegionScope,
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
