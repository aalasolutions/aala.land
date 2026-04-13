import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, SelectQueryBuilder } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { REGION_FILTER_SUBQUERY } from '../../shared/utils/region-filter.util';

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
  ) { }

  async create(companyId: string, dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const order = this.workOrderRepository.create({ ...dto, companyId });
    return this.workOrderRepository.save(order);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
  ) {
    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId });

    if (regionCode) {
      qb.andWhere(
        `wo.unit_id IN (${REGION_FILTER_SUBQUERY})`,
        { regionCode },
      );
    }

    qb.skip((page - 1) * limit)
      .take(limit)
      .orderBy('wo.created_at', 'DESC');

    const [orders, total] = await qb.getManyAndCount();

    const orderIds = orders.map(o => o.id);
    let unitMap: Record<string, { unitNumber: string; buildingName: string; areaName: string }> = {};
    if (orderIds.length) {
      const unitInfo = await this.workOrderRepository.query(
        `SELECT wo.id AS "woId", u.unit_number AS "unitNumber", b.name AS "buildingName", loc.name AS "areaName"
         FROM work_orders wo
         LEFT JOIN units u ON wo.unit_id = u.id
         LEFT JOIN buildings b ON u.building_id = b.id
         LEFT JOIN localities loc ON b.locality_id = loc.id
         WHERE wo.id = ANY($1)`,
        [orderIds],
      );
      unitMap = Object.fromEntries(
        unitInfo.map((r: { woId: string; unitNumber: string; buildingName: string; areaName: string }) => [r.woId, { unitNumber: r.unitNumber, buildingName: r.buildingName, areaName: r.areaName }]),
      );
    }

    const data = orders.map(o => ({
      ...o,
      unitNumber: unitMap[o.id]?.unitNumber ?? null,
      buildingName: unitMap[o.id]?.buildingName ?? null,
      areaName: unitMap[o.id]?.areaName ?? null,
    }));

    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<WorkOrder> {
    const order = await this.workOrderRepository.findOne({ where: { id, companyId } });
    if (!order) {
      throw new NotFoundException('Work order not found');
    }
    return order;
  }

  async update(id: string, companyId: string, dto: UpdateWorkOrderDto): Promise<WorkOrder> {
    const order = await this.findOne(id, companyId);
    Object.assign(order, dto);

    if (dto.status === WorkOrderStatus.COMPLETED && !order.completedAt) {
      order.completedAt = new Date();
    }

    return this.workOrderRepository.save(order);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const order = await this.findOne(id, companyId);
    await this.workOrderRepository.remove(order);
  }

  async getCostSummary(companyId: string, regionCode?: string): Promise<CostSummary> {
    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .select('COALESCE(SUM(wo.estimated_cost), 0)', 'totalEstimated')
      .addSelect('COALESCE(SUM(wo.actual_cost), 0)', 'totalActual')
      .addSelect('COUNT(*)::int', 'workOrderCount')
      .where('wo.company_id = :companyId', { companyId });

    if (regionCode) {
      qb.andWhere(
        `wo.unit_id IN (${REGION_FILTER_SUBQUERY})`,
        { regionCode },
      );
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

  async getUpcoming(companyId: string, regionCode?: string): Promise<WorkOrder[]> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const qb = this.workOrderRepository
      .createQueryBuilder('wo')
      .where('wo.company_id = :companyId', { companyId })
      .andWhere('wo.is_preventive = true')
      .andWhere('wo.next_scheduled_date <= :thirtyDays', { thirtyDays: thirtyDaysFromNow })
      .orderBy('wo.next_scheduled_date', 'ASC');

    if (regionCode) {
      qb.andWhere(
        `wo.unit_id IN (${REGION_FILTER_SUBQUERY})`,
        { regionCode },
      );
    }

    return qb.take(100).getMany();
  }
}
