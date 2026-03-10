import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create(dto);
    return await this.auditLogRepository.save(auditLog);
  }

  async findAll(
    companyId: string,
    query: QueryAuditLogsDto,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, action, entityType, entityId, userId } = query;

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoinAndSelect('auditLog.user', 'user')
      .leftJoinAndSelect('auditLog.company', 'company')
      .where('auditLog.companyId = :companyId', { companyId })
      .orderBy('auditLog.createdAt', 'DESC');

    if (action) {
      queryBuilder.andWhere('auditLog.action = :action', { action });
    }

    if (entityType) {
      queryBuilder.andWhere('auditLog.entityType = :entityType', { entityType });
    }

    if (entityId) {
      queryBuilder.andWhere('auditLog.entityId = :entityId', { entityId });
    }

    if (userId) {
      queryBuilder.andWhere('auditLog.userId = :userId', { userId });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, companyId: string): Promise<AuditLog> {
    const auditLog = await this.auditLogRepository.findOne({
      where: { id, companyId },
      relations: ['user', 'company'],
    });

    if (!auditLog) {
      throw new NotFoundException(`Audit log with ID ${id} not found`);
    }

    return auditLog;
  }
}
