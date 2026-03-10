import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commission, CommissionStatus } from './entities/commission.entity';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';

@Injectable()
export class CommissionsService {
  constructor(
    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,
  ) { }

  async create(companyId: string, dto: CreateCommissionDto): Promise<Commission> {
    const commissionAmount = (dto.grossAmount * dto.commissionRate) / 100;

    const commission = this.commissionRepository.create({
      ...dto,
      companyId,
      commissionAmount,
    });
    return this.commissionRepository.save(commission);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: Commission[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.commissionRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
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
      skip: (page - 1) * limit,
      take: limit,
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
    const commissions = await this.commissionRepository.find({
      where: { agentId, companyId },
    });

    const totalEarned = commissions.reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const totalPaid = commissions
      .filter((c) => c.status === CommissionStatus.PAID)
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const totalPending = commissions
      .filter((c) => c.status === CommissionStatus.PENDING || c.status === CommissionStatus.APPROVED)
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);

    return { totalEarned, totalPaid, totalPending, count: commissions.length };
  }
}
