import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  And,
  LessThan,
  MoreThanOrEqual,
  In,
  IsNull,
  Not,
  FindOperator,
  FindOptionsWhere,
} from 'typeorm';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import {
  LeadActivity,
  ActivityType,
} from '../leads/entities/lead-activity.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../financial/entities/transaction.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { PropertyType } from '../properties/entities/property-type.enum';
import {
  Commission,
  CommissionStatus,
} from '../commissions/entities/commission.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque, ChequeStatus } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { clampLimit, pageSkip } from '../../shared/utils/pagination.util';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import {
  ContactPrivacyService,
  ContactViewer,
} from '../contacts/contact-privacy.service';
import { limitedDisplayName } from '../../shared/utils/contact-privacy.util';
import {
  effectiveRegionCodes,
  isAdminRole,
} from '../../shared/utils/region-visibility.util';
import {
  regionTimezoneSql,
  subtractDaysFromInstant,
} from '../../shared/utils/region-time.util';
import {
  moneyDateSql,
  monthBucketSql,
  monthLabelSql,
  monthSeries,
  trendAnchor,
  zeroFillMonths,
} from '../../shared/utils/month-series.util';
import {
  AgentLoadRow,
  CensusRow,
  OPEN_LEAD_STAGES,
  agentLoadQuery,
  closedWindowStart,
  emptyLeadOwnership,
  leadCensusQuery,
  shapeLeadOwnership,
} from './lead-ownership.query';

export interface DashboardKpis {
  totalLeads: number;
  openLeads: number;
  wonLeads: number;
  totalContacts: number;
  totalUnits: number;
  rentalUnits: number;
  occupiedUnits: number;
  monthlyRevenue: number;
  activeLeases: number;
  pendingCheques: number;
}

export interface RevenueTrendPoint {
  month: string;
  total: number;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
  conversionRate: number;
  commissionsEarned: number;
}

export interface RedFlag {
  type: string;
  severity: string;
  message: string;
  entityType: string;
  entityId: string;
  // Locality id for Unit flags; the unit page route needs it.
  areaId?: string | null;
  createdAt: Date;
}

// A lead flag before its name is settled: LIMITED callers get the masked name.
interface LeadFlagDraft {
  flag: RedFlag;
  contact: Contact | null;
  suffix: string;
}

const RED_FLAG_CHECKS = {
  UNTOUCHED_LEAD_48H: {
    label: 'Leads untouched for 48+ hours',
    severity: 'HIGH',
  },
  UNTOUCHED_LEAD_24H: {
    label: 'Leads untouched for 24+ hours',
    severity: 'MEDIUM',
  },
  STALLED_PIPELINE: {
    label: 'Leads stalled in negotiation for 14+ days',
    severity: 'MEDIUM',
  },
  OVERDUE_FOLLOWUP: {
    label: 'Leads with no follow-up for 7+ days',
    severity: 'MEDIUM',
  },
  LONG_VACANT: { label: 'Properties vacant for 30+ days', severity: 'LOW' },
} as const;

type RedFlagType = keyof typeof RED_FLAG_CHECKS;

const RED_FLAG_TYPES = Object.keys(RED_FLAG_CHECKS) as RedFlagType[];

const RED_FLAG_CAP = 20;

export interface RedFlagCheck {
  type: RedFlagType;
  label: string;
  severity: string;
  total: number;
  flags: RedFlag[];
}

interface VacantUnitRow {
  id: string;
  unitNumber: string;
  areaId: string;
  vacantSince: Date | string;
  total: string;
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
}

export interface ActivityFeedPage {
  data: ActivityFeedItem[];
  total: number;
  page: number;
  limit: number;
}

export interface PipelineFunnel {
  stage: string;
  count: number;
}

export interface AgentLeadLoad {
  agentId: string;
  agentName: string;
  openTotal: number;
  stages: PipelineFunnel[];
  won: number;
  lost: number;
}

export interface LeadOwnership {
  agents: AgentLeadLoad[];
  pipeline: PipelineFunnel[];
  won: number;
  lost: number;
  unassignedOpen: number;
}

export interface StageBottleneck {
  stage: string;
  avgDays: number;
  count: number;
  slowestLeadDays: number;
}

export interface AgentResponseTime {
  agentId: string;
  avgResponseMinutes: number;
  totalLeadsHandled: number;
}

export interface Achievement {
  type: string;
  agentId: string;
  message: string;
  value: number;
}

export interface AgentComparison {
  agentId: string;
  leadsAssigned: number;
  leadsWon: number;
  conversionRate: number;
  commissionsEarned: number;
  rank: number;
}

const REVENUE_KEYS = ['total'] as const;

const PIPELINE_STAGE_ORDER = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.VIEWING,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,

    @InjectRepository(LeadActivity)
    private readonly activityRepository: Repository<LeadActivity>,

    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,

    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,

    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,

    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,

    @InjectRepository(Cheque)
    private readonly chequeRepository: Repository<Cheque>,

    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,

    private readonly contactPrivacy: ContactPrivacyService,
  ) {}

  async getDashboardKpis(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<DashboardKpis> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means nothing to total, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return {
        totalLeads: 0,
        openLeads: 0,
        wonLeads: 0,
        totalContacts: 0,
        totalUnits: 0,
        rentalUnits: 0,
        occupiedUnits: 0,
        monthlyRevenue: 0,
        activeLeases: 0,
        pendingCheques: 0,
      };
    }

    // Same business date as the revenue trend, so one card cannot show two answers.
    const zone = regionTimezoneSql('t.region_code');
    const moneyDate = moneyDateSql('t');
    const monthStart = `date_trunc('month', now() AT TIME ZONE ${zone})::date`;
    const inRegionMonth = `(${moneyDate} >= ${monthStart} AND ${moneyDate} < (${monthStart} + INTERVAL '1 month'))`;

    // Leads and contacts have a direct regionCode.
    const leadWhere: FindOptionsWhere<Lead> = { companyId };
    if (regionCodes) leadWhere.regionCode = In(regionCodes);
    const contactWhere: FindOptionsWhere<Contact> = { companyId };
    if (regionCodes) contactWhere.regionCode = In(regionCodes);

    // Occupancy covers For Rent units only; rented status OR an active lease counts as occupied.
    // Maintenance and sold units without an active lease are neither occupied nor vacant.
    const occupancyQb = this.unitRepository
      .createQueryBuilder('u')
      .select('COUNT(*)::int', 'rentalUnits')
      .addSelect(
        `COUNT(*) FILTER (WHERE u.status = :rented OR EXISTS (
          SELECT 1 FROM leases le
          WHERE le.unit_id = u.id AND le.company_id = :companyId
            AND le.status = :activeLease AND le.deleted_at IS NULL
        ))::int`,
        'occupiedUnits',
      )
      .where('u.company_id = :companyId', { companyId })
      .andWhere('u.deleted_at IS NULL')
      .andWhere('u.property_type = :rental', { rental: PropertyType.RENTAL })
      .andWhere(
        `(u.status IN (:...rentableStatuses) OR EXISTS (
          SELECT 1 FROM leases le
          WHERE le.unit_id = u.id AND le.company_id = :companyId
            AND le.status = :activeLease AND le.deleted_at IS NULL
        ))`,
        { rentableStatuses: [UnitStatus.AVAILABLE, UnitStatus.RENTED] },
      )
      .setParameter('rented', UnitStatus.RENTED)
      .setParameter('activeLease', LeaseStatus.ACTIVE);
    if (regionCodes) {
      occupancyQb
        .innerJoin('assets', 'ast', 'u.asset_id = ast.id')
        .innerJoin('localities', 'loc', 'ast.locality_id = loc.id')
        .innerJoin('cities', 'ci', 'loc.city_id = ci.id')
        .andWhere('ci.region_code IN (:...regionCodes)', { regionCodes });
    }

    let totalUnitsPromise: Promise<number>;
    let revenuePromise: Promise<any>;
    let activeLeasesPromise: Promise<number>;
    let pendingChequesPromise: Promise<number>;

    if (regionCodes) {
      // Units have no region column, so they walk the FK chain to the city.
      totalUnitsPromise = this.unitRepository
        .createQueryBuilder('u')
        .innerJoin('assets', 'ast', 'u.asset_id = ast.id')
        .innerJoin('localities', 'loc', 'ast.locality_id = loc.id')
        .innerJoin('cities', 'ci', 'loc.city_id = ci.id')
        .where('u.company_id = :companyId', { companyId })
        .andWhere('u.deleted_at IS NULL')
        .andWhere('ci.region_code IN (:...regionCodes)', { regionCodes })
        .getCount();

      // Own column, not the unit chain, so this matches financial.getSummary.
      revenuePromise = this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.companyId = :companyId', { companyId })
        .andWhere('t.type = :type', { type: TransactionType.INCOME })
        .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
        .andWhere(inRegionMonth)
        .andWhere('t.regionCode IN (:...regionCodes)', { regionCodes })
        .getRawOne();

      // Leases carry their own region, like cheques.
      activeLeasesPromise = this.leaseRepository
        .createQueryBuilder('l')
        .where('l.company_id = :companyId', { companyId })
        .andWhere('l.status = :status', { status: LeaseStatus.ACTIVE })
        .andWhere('l.deleted_at IS NULL')
        .andWhere('l.region_code IN (:...regionCodes)', { regionCodes })
        .getCount();

      // Cheques carry their own region, so a cheque with no unit still counts.
      pendingChequesPromise = this.chequeRepository
        .createQueryBuilder('c')
        .where('c.company_id = :companyId', { companyId })
        .andWhere('c.status = :status', { status: ChequeStatus.PENDING })
        .andWhere('c.region_code IN (:...regionCodes)', { regionCodes })
        .getCount();
    } else {
      totalUnitsPromise = this.unitRepository.count({
        where: { companyId, deletedAt: IsNull() },
      });
      revenuePromise = this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.companyId = :companyId', { companyId })
        .andWhere('t.type = :type', { type: TransactionType.INCOME })
        .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
        .andWhere(inRegionMonth)
        .getRawOne();
      activeLeasesPromise = this.leaseRepository.count({
        where: { companyId, status: LeaseStatus.ACTIVE, deletedAt: IsNull() },
      });
      pendingChequesPromise = this.chequeRepository.count({
        where: { companyId, status: ChequeStatus.PENDING },
      });
    }

    const [
      totalLeads,
      openLeads,
      wonLeads,
      totalContacts,
      totalUnits,
      occupancyResult,
      revenueResult,
      activeLeases,
      pendingCheques,
    ] = await Promise.all([
      this.leadRepository.count({ where: leadWhere }),
      this.leadRepository.count({
        where: { ...leadWhere, status: In(OPEN_LEAD_STAGES) },
      }),
      this.leadRepository.count({
        where: { ...leadWhere, status: LeadStatus.WON },
      }),
      this.contactRepository.count({ where: contactWhere }),
      totalUnitsPromise,
      occupancyQb.getRawOne<{ rentalUnits: number; occupiedUnits: number }>(),
      revenuePromise,
      activeLeasesPromise,
      pendingChequesPromise,
    ]);

    return {
      totalLeads,
      openLeads,
      wonLeads,
      totalContacts,
      totalUnits,
      rentalUnits: Number(occupancyResult?.rentalUnits ?? 0),
      occupiedUnits: Number(occupancyResult?.occupiedUnits ?? 0),
      monthlyRevenue: Number(revenueResult?.total ?? 0),
      activeLeases,
      pendingCheques,
    };
  }

  // Buckets on the day the money arrived; a completed row always carries one.
  async getRevenueTrend(
    companyId: string,
    months = 6,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<RevenueTrendPoint[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    const series = monthSeries(months, trendAnchor(regionCodes));
    const empty = zeroFillMonths(series, [], REVENUE_KEYS);

    // No readable region means nothing to total, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) return empty;

    const label = monthLabelSql('t');

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(label, 'month')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.type = :type', { type: TransactionType.INCOME })
      .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
      .andWhere(`${monthBucketSql('t')} >= :from`, { from: `${series[0]}-01` })
      .groupBy(label);

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const rows = await qb.getRawMany<{ month: string; total: string }>();

    return zeroFillMonths(series, rows, REVENUE_KEYS);
  }

  async getAgentPerformance(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<AgentPerformance[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return [];
    }

    const leadQb = this.leadRepository
      .createQueryBuilder('l')
      .select('l.assignedTo', 'agentId')
      .addSelect('COUNT(*)::int', 'leadsAssigned')
      .addSelect(
        'SUM(CASE WHEN l.status = :won THEN 1 ELSE 0 END)::int',
        'leadsWon',
      )
      .addSelect(
        'SUM(CASE WHEN l.status = :lost THEN 1 ELSE 0 END)::int',
        'leadsLost',
      )
      .where('l.companyId = :companyId', { companyId })
      .andWhere('l.assignedTo IS NOT NULL')
      .setParameter('won', LeadStatus.WON)
      .setParameter('lost', LeadStatus.LOST);

    if (regionCodes)
      leadQb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });
    leadQb.groupBy('l.assignedTo');

    const commQb = this.commissionRepository
      .createQueryBuilder('c')
      .select('c.agentId', 'agentId')
      .addSelect('COALESCE(SUM(c.commissionAmount), 0)', 'commissionsEarned')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.status IN (:...commStatuses)', {
        commStatuses: [CommissionStatus.APPROVED, CommissionStatus.PAID],
      });

    if (regionCodes)
      commQb.andWhere('c.regionCode IN (:...regionCodes)', { regionCodes });
    commQb.groupBy('c.agentId');

    const [leadStats, commissionStats] = await Promise.all([
      leadQb.getRawMany(),
      commQb.getRawMany(),
    ]);

    const agentMap = new Map<string, AgentPerformance>();

    for (const row of leadStats) {
      agentMap.set(row.agentId, {
        agentId: row.agentId,
        agentName: '',
        leadsAssigned: Number(row.leadsAssigned),
        leadsWon: Number(row.leadsWon),
        leadsLost: Number(row.leadsLost),
        conversionRate: 0,
        commissionsEarned: 0,
      });
    }

    for (const row of commissionStats) {
      if (agentMap.has(row.agentId)) {
        agentMap.get(row.agentId)!.commissionsEarned = Number(
          row.commissionsEarned,
        );
      } else {
        agentMap.set(row.agentId, {
          agentId: row.agentId,
          agentName: '',
          leadsAssigned: 0,
          leadsWon: 0,
          leadsLost: 0,
          conversionRate: 0,
          commissionsEarned: Number(row.commissionsEarned),
        });
      }
    }

    const agentIds = Array.from(agentMap.keys());
    if (agentIds.length > 0) {
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select(['u.id', 'u.name'])
        .where('u.id IN (:...agentIds)', { agentIds })
        .getMany();

      for (const user of users) {
        if (agentMap.has(user.id)) {
          agentMap.get(user.id)!.agentName = user.name;
        }
      }
    }

    return Array.from(agentMap.values()).map((p) => {
      const closed = p.leadsWon + p.leadsLost;
      return {
        ...p,
        conversionRate:
          closed > 0 ? Math.round((p.leadsWon / closed) * 100) : 0,
      };
    });
  }

  async getRedFlags(
    companyId: string,
    regionCode?: string,
    caller?: ContactViewer,
  ): Promise<RedFlagCheck[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return RED_FLAG_TYPES.map((type) => this.redFlagCheck(type, 0, []));
    }

    const now = new Date();
    const hours24Ago = subtractDaysFromInstant(now, 1);
    const hours48Ago = subtractDaysFromInstant(now, 2);

    const leadWhere: FindOptionsWhere<Lead> = { companyId };
    if (regionCodes) leadWhere.regionCode = In(regionCodes);

    const drafts: LeadFlagDraft[] = [];
    const checks = await Promise.all([
      this.untouchedLeadsCheck(
        'UNTOUCHED_LEAD_48H',
        '48+ hours',
        leadWhere,
        LessThan(hours48Ago),
        drafts,
      ),
      this.untouchedLeadsCheck(
        'UNTOUCHED_LEAD_24H',
        '24+ hours',
        leadWhere,
        And(MoreThanOrEqual(hours48Ago), LessThan(hours24Ago)),
        drafts,
      ),
      this.stalledLeadsCheck(
        leadWhere,
        subtractDaysFromInstant(now, 14),
        drafts,
      ),
      this.overdueFollowupsCheck(
        companyId,
        regionCodes,
        subtractDaysFromInstant(now, 7),
        drafts,
      ),
      this.longVacantUnitsCheck(companyId, regionCodes, now),
    ]);
    await this.maskLimitedLeadFlags(companyId, caller, drafts);
    return checks;
  }

  // One access lookup for every flagged contact; LIMITED ones show first name and last initial.
  private async maskLimitedLeadFlags(
    companyId: string,
    caller: ContactViewer | undefined,
    drafts: LeadFlagDraft[],
  ): Promise<void> {
    const contacts = new Map<string, Contact>();
    drafts.forEach((d) => {
      if (d.contact) contacts.set(d.contact.id, d.contact);
    });
    const levels = await this.contactPrivacy.accessLevelFor(companyId, caller, [
      ...contacts.values(),
    ]);
    for (const draft of drafts) {
      if (draft.contact && levels.get(draft.contact.id) !== 'FULL') {
        const name = limitedDisplayName(draft.contact) || 'Lead';
        draft.flag.message = `${name} ${draft.suffix}`;
      }
    }
  }

  private redFlagCheck(
    type: RedFlagType,
    total: number,
    flags: RedFlag[],
  ): RedFlagCheck {
    return { type, ...RED_FLAG_CHECKS[type], total, flags };
  }

  private leadFlag(
    type: RedFlagType,
    lead: Lead,
    message: string,
    createdAt: Date,
    drafts: LeadFlagDraft[],
  ): RedFlag {
    const flag: RedFlag = {
      type,
      severity: RED_FLAG_CHECKS[type].severity,
      message: `${this.leadFlagName(lead)} ${message}`,
      entityType: 'Lead',
      entityId: lead.id,
      createdAt,
    };
    drafts.push({ flag, contact: lead.contact ?? null, suffix: message });
    return flag;
  }

  private async untouchedLeadsCheck(
    type: RedFlagType,
    age: string,
    leadWhere: FindOptionsWhere<Lead>,
    createdAt: FindOperator<Date>,
    drafts: LeadFlagDraft[],
  ): Promise<RedFlagCheck> {
    const [leads, total] = await this.leadRepository.findAndCount({
      where: { ...leadWhere, status: LeadStatus.NEW, createdAt },
      select: ['id', 'contactId', 'createdAt'],
      relations: ['contact'],
      order: { createdAt: 'ASC' },
      take: RED_FLAG_CAP,
    });
    return this.redFlagCheck(
      type,
      total,
      leads.map((lead) =>
        this.leadFlag(
          type,
          lead,
          `untouched for ${age}`,
          lead.createdAt,
          drafts,
        ),
      ),
    );
  }

  private async stalledLeadsCheck(
    leadWhere: FindOptionsWhere<Lead>,
    days14Ago: Date,
    drafts: LeadFlagDraft[],
  ): Promise<RedFlagCheck> {
    const [leads, total] = await this.leadRepository.findAndCount({
      where: {
        ...leadWhere,
        status: LeadStatus.NEGOTIATING,
        updatedAt: LessThan(days14Ago),
      },
      select: ['id', 'contactId', 'status', 'updatedAt'],
      relations: ['contact'],
      order: { updatedAt: 'ASC' },
      take: RED_FLAG_CAP,
    });
    return this.redFlagCheck(
      'STALLED_PIPELINE',
      total,
      leads.map((lead) =>
        this.leadFlag(
          'STALLED_PIPELINE',
          lead,
          `stuck in ${lead.status} for 14+ days`,
          lead.updatedAt,
          drafts,
        ),
      ),
    );
  }

  private async overdueFollowupsCheck(
    companyId: string,
    regionCodes: string[] | null,
    days7Ago: Date,
    drafts: LeadFlagDraft[],
  ): Promise<RedFlagCheck> {
    const overdueQb = this.leadRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.contact', 'c')
      .select([
        'l.id',
        'l.status',
        'l.updatedAt',
        'l.contactId',
        'c.id',
        'c.firstName',
        'c.lastName',
        'c.phone',
        'c.regionCode',
        'c.createdBy',
      ])
      .where('l.companyId = :companyId', { companyId })
      .andWhere('l.status IN (:...statuses)', {
        statuses: [LeadStatus.CONTACTED, LeadStatus.VIEWING],
      })
      .andWhere('l.updatedAt < :days7Ago', { days7Ago });
    if (regionCodes)
      overdueQb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });
    overdueQb.orderBy('l.updatedAt', 'ASC').take(RED_FLAG_CAP);

    const [leads, total] = await overdueQb.getManyAndCount();
    return this.redFlagCheck(
      'OVERDUE_FOLLOWUP',
      total,
      leads.map((lead) =>
        this.leadFlag(
          'OVERDUE_FOLLOWUP',
          lead,
          `in ${lead.status}, no update for 7+ days`,
          lead.updatedAt,
          drafts,
        ),
      ),
    );
  }

  // Vacant since the latest lease end (a hand-ended lease from its status change), else unit creation.
  private async longVacantUnitsCheck(
    companyId: string,
    regionCodes: string[] | null,
    now: Date,
  ): Promise<RedFlagCheck> {
    const endedAtSql = `(SELECT MAX(rh.created_at) FROM record_history rh
      WHERE rh.company_id = le.company_id AND rh.entity_type = :leaseEntity
        AND rh.entity_id = le.id
        AND (rh.action = :terminateAction OR (rh.action = :statusChangeAction
          AND rh.metadata->>'to' = le.status::text)))`;
    const vacantSinceSql = `COALESCE(MAX(CASE le.status
      WHEN :terminatedLease THEN COALESCE(${endedAtSql}, le.updated_at)
      WHEN :expiredLease THEN LEAST(le.end_date::timestamptz, ${endedAtSql})
      ELSE le.end_date::timestamptz END), u.created_at)`;

    const vacantQb = this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'ast')
      .leftJoin(
        'leases',
        'le',
        `le.unit_id = u.id AND le.company_id = u.company_id
          AND le.deleted_at IS NULL AND le.status IN (:...endedLeaseStatuses)`,
      )
      .select('u.id', 'id')
      .addSelect('u.unit_number', 'unitNumber')
      .addSelect('ast.locality_id', 'areaId')
      .addSelect(vacantSinceSql, 'vacantSince')
      .addSelect('COUNT(*) OVER ()', 'total')
      .where('u.company_id = :companyId', { companyId })
      .andWhere('u.deleted_at IS NULL')
      .andWhere('u.status = :available', { available: UnitStatus.AVAILABLE })
      .andWhere('u.property_type = :rental', { rental: PropertyType.RENTAL })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM leases al WHERE al.unit_id = u.id
          AND al.company_id = u.company_id AND al.status = :activeLease
          AND al.deleted_at IS NULL)`,
      )
      .groupBy('u.id')
      .addGroupBy('ast.locality_id')
      .having(`${vacantSinceSql} < :days30Ago`, {
        days30Ago: subtractDaysFromInstant(now, 30),
      })
      .setParameters({
        activeLease: LeaseStatus.ACTIVE,
        terminatedLease: LeaseStatus.TERMINATED,
        expiredLease: LeaseStatus.EXPIRED,
        endedLeaseStatuses: [
          LeaseStatus.EXPIRED,
          LeaseStatus.TERMINATED,
          LeaseStatus.RENEWED,
        ],
        leaseEntity: 'Lease',
        terminateAction: RecordHistoryAction.TERMINATE,
        statusChangeAction: RecordHistoryAction.STATUS_CHANGE,
      })
      .orderBy(vacantSinceSql, 'ASC')
      .limit(RED_FLAG_CAP);
    if (regionCodes) {
      vacantQb
        .innerJoin('localities', 'loc', 'ast.locality_id = loc.id')
        .innerJoin('cities', 'ci', 'loc.city_id = ci.id')
        .andWhere('ci.region_code IN (:...regionCodes)', { regionCodes });
    }

    const units = await vacantQb.getRawMany<VacantUnitRow>();
    const flags = units.map((unit): RedFlag => {
      const vacantSince = new Date(unit.vacantSince);
      const days = Math.floor(
        (now.getTime() - vacantSince.getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        type: 'LONG_VACANT',
        severity: RED_FLAG_CHECKS.LONG_VACANT.severity,
        message: `Property ${unit.unitNumber} vacant for ${days} days`,
        entityType: 'Unit',
        entityId: unit.id,
        areaId: unit.areaId,
        createdAt: vacantSince,
      };
    });
    return this.redFlagCheck(
      'LONG_VACANT',
      Number(units[0]?.total ?? 0),
      flags,
    );
  }

  async getActivityFeed(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
    page = 1,
    limit = 20,
  ): Promise<ActivityFeedPage> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const action = Not(In([AuditAction.LOGIN, AuditAction.LOGOUT]));

    // A NULL region marks a global row such as billing, which stays admin-only.
    const regionWhere: FindOptionsWhere<AuditLog>[] | undefined = regionCodes
      ? [
          { companyId, action, regionCode: In(regionCodes) },
          ...(caller && isAdminRole(caller.role)
            ? [{ companyId, action, regionCode: IsNull() }]
            : []),
        ]
      : undefined;

    const [logs, total] = await this.auditLogRepository.findAndCount({
      where: regionWhere ?? { companyId, action },
      order: { createdAt: 'DESC' },
      skip: pageSkip(page, limit),
      take: clampLimit(limit),
      relations: { user: true },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true,
        createdAt: true,
        user: { id: true, name: true },
      },
    });

    const data = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.userId,
      userName: log.user?.name ?? null,
      createdAt: log.createdAt,
    }));

    return { data, total, page, limit };
  }

  async getPipelineFunnel(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<PipelineFunnel[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no leads, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return PIPELINE_STAGE_ORDER.map((stage) => ({ stage, count: 0 }));
    }

    const qb = this.leadRepository
      .createQueryBuilder('l')
      .select('l.status', 'stage')
      .addSelect('COUNT(*)::int', 'count')
      .where('l.companyId = :companyId', { companyId });

    if (regionCodes)
      qb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });
    qb.groupBy('l.status');

    const results = await qb.getRawMany();

    const countMap = new Map(results.map((r) => [r.stage, Number(r.count)]));

    return PIPELINE_STAGE_ORDER.map((stage) => ({
      stage,
      count: countMap.get(stage) ?? 0,
    }));
  }

  // lead-ownership.query.ts owns the two builders and the row shaping.
  async getLeadOwnership(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<LeadOwnership> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no leads, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) return emptyLeadOwnership();

    const closedSince = closedWindowStart();
    const [rows, census] = await Promise.all([
      agentLoadQuery(
        this.userRepository,
        companyId,
        regionCodes,
        closedSince,
      ).getRawMany<AgentLoadRow>(),
      leadCensusQuery(
        this.leadRepository,
        companyId,
        regionCodes,
        closedSince,
      ).getRawMany<CensusRow>(),
    ]);

    return shapeLeadOwnership(rows, census);
  }

  async getBottlenecks(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<StageBottleneck[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return [];
    }

    const now = new Date();

    const qb = this.leadRepository
      .createQueryBuilder('l')
      .select('l.status', 'stage')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect(
        `ROUND(AVG(EXTRACT(EPOCH FROM (:now::timestamptz - l.stage_entered_at)) / 86400), 1)`,
        'avgDays',
      )
      .addSelect(
        `ROUND(MAX(EXTRACT(EPOCH FROM (:now::timestamptz - l.stage_entered_at)) / 86400), 1)`,
        'slowestLeadDays',
      )
      .where('l.companyId = :companyId', { companyId })
      .andWhere('l.stageEnteredAt IS NOT NULL')
      .andWhere('l.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: [LeadStatus.WON, LeadStatus.LOST],
      })
      .setParameter('now', now);

    if (regionCodes)
      qb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });

    const results = await qb
      .groupBy('l.status')
      .orderBy('"avgDays"', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      stage: r.stage,
      avgDays: Number(r.avgDays),
      count: Number(r.count),
      slowestLeadDays: Number(r.slowestLeadDays),
    }));
  }

  async getResponseTimeMetrics(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<AgentResponseTime[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return [];
    }

    // lead.createdAt alone can't show the diff to the first status change
    const qb = this.activityRepository
      .createQueryBuilder('a')
      .select('l.assigned_to', 'agentId')
      .addSelect('COUNT(DISTINCT a.lead_id)::int', 'totalLeadsHandled')
      .addSelect(
        `ROUND(AVG(EXTRACT(EPOCH FROM (first_activity.first_change - l.created_at)) / 60), 1)`,
        'avgResponseMinutes',
      )
      .innerJoin('leads', 'l', 'l.id = a.lead_id')
      .innerJoin(
        (qb) =>
          qb
            .select('fa.lead_id', 'lead_id')
            .addSelect('MIN(fa.created_at)', 'first_change')
            .from('lead_activities', 'fa')
            .where('fa.company_id = :companyId')
            .andWhere('fa.type = :statusChangeType')
            .groupBy('fa.lead_id'),
        'first_activity',
        'first_activity.lead_id = a.lead_id',
      )
      .where('a.company_id = :companyId', { companyId })
      .andWhere('a.type = :statusChangeType', {
        statusChangeType: ActivityType.STATUS_CHANGE,
      })
      .andWhere('l.assigned_to IS NOT NULL')
      .setParameter('companyId', companyId)
      .setParameter('statusChangeType', ActivityType.STATUS_CHANGE)
      .groupBy('l.assigned_to');

    if (regionCodes) {
      qb.andWhere('l.region_code IN (:...regionCodes)', { regionCodes });
    }

    const results = await qb.getRawMany();

    return results.map((r) => ({
      agentId: r.agentId,
      avgResponseMinutes: Number(r.avgResponseMinutes),
      totalLeadsHandled: Number(r.totalLeadsHandled),
    }));
  }

  async getAchievements(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<Achievement[]> {
    const agents = await this.getAgentPerformance(
      companyId,
      regionCode,
      caller,
    );
    const achievements: Achievement[] = [];

    if (agents.length === 0) return achievements;

    const bestConverter = agents.reduce(
      (best, a) => (a.conversionRate > best.conversionRate ? a : best),
      agents[0],
    );
    if (bestConverter.conversionRate > 0) {
      achievements.push({
        type: 'BEST_CONVERSION',
        agentId: bestConverter.agentId,
        message: `Highest conversion rate: ${bestConverter.conversionRate}%`,
        value: bestConverter.conversionRate,
      });
    }

    const mostWins = agents.reduce(
      (best, a) => (a.leadsWon > best.leadsWon ? a : best),
      agents[0],
    );
    if (mostWins.leadsWon > 0) {
      achievements.push({
        type: 'MOST_WINS',
        agentId: mostWins.agentId,
        message: `Most leads won: ${mostWins.leadsWon}`,
        value: mostWins.leadsWon,
      });
    }

    const topEarner = agents.reduce(
      (best, a) => (a.commissionsEarned > best.commissionsEarned ? a : best),
      agents[0],
    );
    if (topEarner.commissionsEarned > 0) {
      achievements.push({
        type: 'TOP_EARNER',
        agentId: topEarner.agentId,
        message: `Top commission earner: ${topEarner.commissionsEarned.toLocaleString()}`,
        value: topEarner.commissionsEarned,
      });
    }

    const mostActive = agents.reduce(
      (best, a) => (a.leadsAssigned > best.leadsAssigned ? a : best),
      agents[0],
    );
    if (mostActive.leadsAssigned > 0) {
      achievements.push({
        type: 'MOST_ACTIVE',
        agentId: mostActive.agentId,
        message: `Most leads handled: ${mostActive.leadsAssigned}`,
        value: mostActive.leadsAssigned,
      });
    }

    return achievements;
  }

  async getAgentComparison(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<AgentComparison[]> {
    const agents = await this.getAgentPerformance(
      companyId,
      regionCode,
      caller,
    );

    const sorted = [...agents].sort((a, b) => {
      if (b.conversionRate !== a.conversionRate)
        return b.conversionRate - a.conversionRate;
      return b.leadsWon - a.leadsWon;
    });

    return sorted.map((agent, idx) => ({
      agentId: agent.agentId,
      leadsAssigned: agent.leadsAssigned,
      leadsWon: agent.leadsWon,
      conversionRate: agent.conversionRate,
      commissionsEarned: agent.commissionsEarned,
      rank: idx + 1,
    }));
  }

  // The contact carries the name; a lead has none of its own.
  private leadFlagName(lead: {
    contact?: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
    } | null;
  }): string {
    const c = lead.contact;
    const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim();
    return name || c?.phone || 'Lead';
  }
}
