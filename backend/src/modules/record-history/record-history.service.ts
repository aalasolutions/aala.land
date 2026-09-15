import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  RecordHistory,
  RecordHistoryAction,
} from './entities/record-history.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import {
  isAdminRole,
  seesAllRegions,
} from '@shared/utils/region-visibility.util';
import { QueryRecordHistoryDto } from './dto/query-record-history.dto';

export interface RecordHistoryInput {
  companyId: string | null;
  action: RecordHistoryAction;
  entityType: string;
  entityId: string;
  entityTitle: string;
  contextTitle?: string | null;
  reason?: string | null;
  actorId?: string | null;
  actorName: string;
  regionCode?: string | null;
  metadata?: Record<string, any> | null;
}

const GLOBAL_ENTITY_TYPES = new Set(['asset']);

export function isGlobalRecordHistoryType(entityType: string): boolean {
  return GLOBAL_ENTITY_TYPES.has(entityType.toLowerCase());
}

const TITLE_MAX = 255;

@Injectable()
export class RecordHistoryService {
  constructor(
    @InjectRepository(RecordHistory)
    private readonly recordHistoryRepository: Repository<RecordHistory>,
  ) {}

  async record(
    manager: EntityManager,
    input: RecordHistoryInput,
  ): Promise<void> {
    const isGlobal = isGlobalRecordHistoryType(input.entityType);
    if (!input.companyId && !isGlobal) {
      throw new InternalServerErrorException(
        `record_history requires companyId for entity type ${input.entityType}`,
      );
    }

    const regionCode =
      input.regionCode !== undefined
        ? input.regionCode
        : isGlobal || !input.companyId
          ? null
          : await this.defaultRegionFor(manager, input.companyId);

    const reason = input.reason?.trim() || null;

    await manager.insert(RecordHistory, {
      companyId: input.companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityTitle: input.entityTitle.slice(0, TITLE_MAX),
      contextTitle: input.contextTitle?.slice(0, TITLE_MAX) ?? null,
      reason,
      actorId: input.actorId ?? null,
      actorName: input.actorName.slice(0, TITLE_MAX),
      regionCode,
      metadata: input.metadata ?? null,
    });
  }

  async resolveActorName(
    manager: EntityManager,
    actorId: string,
  ): Promise<string> {
    const user = await manager.findOne(User, {
      where: { id: actorId },
      select: { id: true, name: true, email: true },
    });
    return user?.name?.trim() || user?.email || 'Unknown user';
  }

  private async defaultRegionFor(
    manager: EntityManager,
    companyId: string,
  ): Promise<string | null> {
    const company = await manager.findOne(Company, {
      where: { id: companyId },
      select: { id: true, defaultRegionCode: true },
    });
    return company?.defaultRegionCode ?? null;
  }

  async findAll(
    companyId: string,
    query: QueryRecordHistoryDto,
    userRole?: string,
  ): Promise<{
    data: RecordHistory[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      page = 1,
      limit = 20,
      action,
      entityType,
      entityId,
      regionCode,
    } = query;

    const queryBuilder = this.recordHistoryRepository
      .createQueryBuilder('recordHistory')
      .where('recordHistory.companyId = :companyId', { companyId })
      .orderBy('recordHistory.createdAt', 'DESC');

    // NULL region rows stay admin-only.
    if (regionCode && userRole && !seesAllRegions(userRole)) {
      queryBuilder.andWhere(
        isAdminRole(userRole)
          ? '(recordHistory.regionCode = :regionCode OR recordHistory.regionCode IS NULL)'
          : 'recordHistory.regionCode = :regionCode',
        { regionCode },
      );
    }

    if (action) {
      queryBuilder.andWhere('recordHistory.action = :action', { action });
    }

    if (entityType) {
      queryBuilder.andWhere('recordHistory.entityType = :entityType', {
        entityType,
      });
    }

    if (entityId) {
      queryBuilder.andWhere('recordHistory.entityId = :entityId', {
        entityId,
      });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }
}
