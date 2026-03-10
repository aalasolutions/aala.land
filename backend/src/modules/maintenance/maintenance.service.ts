import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from './entities/work-order.entity';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';

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
  ): Promise<{ data: WorkOrder[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.workOrderRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
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
}
