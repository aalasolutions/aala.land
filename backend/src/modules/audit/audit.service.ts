import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { Company } from '../companies/entities/company.entity';
import { isGlobalEntityType } from './audit-global-entities';
import { seesAllRegions } from '@shared/utils/region-visibility.util';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  // A NULL region must mean exactly one thing: the event is global and
  // admin-only. Billing is the only such case, so everything else falls back to
  // the company default when the request carried no region (login, for example).
  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    const regionCode =
      dto.regionCode ??
      (isGlobalEntityType(dto.entityType)
        ? null
        : await this.defaultRegionFor(dto.companyId));

    const auditLog = this.auditLogRepository.create({ ...dto, regionCode });
    return await this.auditLogRepository.save(auditLog);
  }

  private async defaultRegionFor(companyId: string): Promise<string | null> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: { defaultRegionCode: true },
    });
    return company?.defaultRegionCode ?? null;
  }

  async findAll(
    companyId: string,
    query: QueryAuditLogsDto,
    userRole?: string,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      action,
      entityType,
      entityId,
      userId,
      regionCode,
    } = query;

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoinAndSelect('auditLog.user', 'user')
      .leftJoinAndSelect('auditLog.company', 'company')
      .where('auditLog.companyId = :companyId', { companyId })
      .orderBy('auditLog.createdAt', 'DESC');

    // Admins read every region, including the NULL-region global rows such as
    // billing. A region-scoped role sees only its own region, so global rows
    // never leak to it.
    if (regionCode && userRole && !seesAllRegions(userRole)) {
      queryBuilder.andWhere('auditLog.regionCode = :regionCode', {
        regionCode,
      });
    }

    if (action) {
      queryBuilder.andWhere('auditLog.action = :action', { action });
    }

    if (entityType) {
      queryBuilder.andWhere('auditLog.entityType = :entityType', {
        entityType,
      });
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

  async purge(
    companyId: string,
    olderThanDays: number,
  ): Promise<{ deleted: number }> {
    if (olderThanDays < 30) {
      throw new BadRequestException('Minimum retention period is 30 days');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.auditLogRepository.delete({
      companyId,
      createdAt: LessThan(cutoffDate),
    });

    return { deleted: result.affected || 0 };
  }
}
