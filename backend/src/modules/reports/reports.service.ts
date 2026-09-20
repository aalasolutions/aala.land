import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull, FindOptionsWhere } from 'typeorm';
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
import {
  Commission,
  CommissionStatus,
} from '../commissions/entities/commission.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque, ChequeStatus } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../shared/enums/roles.enum';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import {
  effectiveRegionCodes,
  isAdminRole,
} from '../../shared/utils/region-visibility.util';
import {
  regionTimezoneSql,
  subtractDaysFromInstant,
} from '../../shared/utils/region-time.util';
import { monthSeries } from '../../shared/utils/month-series.util';

export interface DashboardKpis {
  totalLeads: number;
  wonLeads: number;
  totalUnits: number;
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
  createdAt: Date;
}

export interface ActivityFeedItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  createdAt: Date;
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

const PIPELINE_STAGE_ORDER = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.VIEWING,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

const OPEN_LEAD_STAGES = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.VIEWING,
  LeadStatus.NEGOTIATING,
];

/** Closed leads age out of lead ownership so the panel reads as current throughput. */
const OWNERSHIP_CLOSED_WINDOW_DAYS = 30;

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
        wonLeads: 0,
        totalUnits: 0,
        monthlyRevenue: 0,
        activeLeases: 0,
        pendingCheques: 0,
      };
    }

    // Month start in each transaction's own region.
    const zone = regionTimezoneSql('t.region_code');
    const inRegionMonth = `t.created_at >= (date_trunc('month', now() AT TIME ZONE ${zone}) AT TIME ZONE ${zone})`;

    // Leads and Commissions have direct regionCode
    const leadWhere: FindOptionsWhere<Lead> = { companyId };
    if (regionCodes) leadWhere.regionCode = In(regionCodes);

    // Units, Transactions, Leases, Cheques need FK chain filtering
    let totalUnitsPromise: Promise<number>;
    let revenuePromise: Promise<any>;
    let activeLeasesPromise: Promise<number>;
    let pendingChequesPromise: Promise<number>;

    if (regionCodes) {
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

      activeLeasesPromise = this.leaseRepository
        .createQueryBuilder('l')
        .innerJoin('units', 'u', 'l.unit_id = u.id')
        .innerJoin('assets', 'ast', 'u.asset_id = ast.id')
        .innerJoin('localities', 'loc', 'ast.locality_id = loc.id')
        .innerJoin('cities', 'ci', 'loc.city_id = ci.id')
        .where('l.company_id = :companyId', { companyId })
        .andWhere('l.status = :status', { status: LeaseStatus.ACTIVE })
        .andWhere('l.deleted_at IS NULL')
        .andWhere('ci.region_code IN (:...regionCodes)', { regionCodes })
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
      wonLeads,
      totalUnits,
      revenueResult,
      activeLeases,
      pendingCheques,
    ] = await Promise.all([
      this.leadRepository.count({ where: leadWhere }),
      this.leadRepository.count({
        where: { ...leadWhere, status: LeadStatus.WON },
      }),
      totalUnitsPromise,
      revenuePromise,
      activeLeasesPromise,
      pendingChequesPromise,
    ]);

    return {
      totalLeads,
      wonLeads,
      totalUnits,
      monthlyRevenue: Number(revenueResult?.total ?? 0),
      activeLeases,
      pendingCheques,
    };
  }

  // Completed income per month, oldest first. Buckets on the business date, with
  // created_at only as a fallback because transaction_date is nullable.
  async getRevenueTrend(
    companyId: string,
    months = 6,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<RevenueTrendPoint[]> {
    const series = monthSeries(months);
    const empty = series.map((month) => ({ month, total: 0 }));

    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means nothing to total, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) return empty;

    const zone = regionTimezoneSql('t.region_code');
    const bucket = `date_trunc('month', COALESCE(t.transaction_date, (t.created_at AT TIME ZONE ${zone})::date))`;

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(`to_char(${bucket}, 'YYYY-MM')`, 'month')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.companyId = :companyId', { companyId })
      .andWhere('t.type = :type', { type: TransactionType.INCOME })
      .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
      .andWhere(`${bucket} >= :from`, { from: `${series[0]}-01` })
      .groupBy(`to_char(${bucket}, 'YYYY-MM')`);

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const rows = await qb.getRawMany<{ month: string; total: string }>();
    const totals = new Map(rows.map((row) => [row.month, Number(row.total)]));

    return series.map((month) => ({ month, total: totals.get(month) ?? 0 }));
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
    caller?: RegionScope,
  ): Promise<RedFlag[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return [];
    }

    const now = new Date();
    const hours24Ago = subtractDaysFromInstant(now, 1);
    const hours48Ago = subtractDaysFromInstant(now, 2);
    const days7Ago = subtractDaysFromInstant(now, 7);
    const days14Ago = subtractDaysFromInstant(now, 14);
    const days30Ago = subtractDaysFromInstant(now, 30);

    const leadWhere: FindOptionsWhere<Lead> = { companyId };
    if (regionCodes) leadWhere.regionCode = In(regionCodes);

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
      ])
      .where('l.companyId = :companyId', { companyId })
      .andWhere('l.status IN (:...statuses)', {
        statuses: [LeadStatus.CONTACTED, LeadStatus.VIEWING],
      })
      .andWhere('l.updatedAt < :days7Ago', { days7Ago });
    if (regionCodes)
      overdueQb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });
    overdueQb.take(20);

    // Vacant units (inherit region through FK)
    let vacantUnitsPromise: Promise<any[]>;
    if (regionCodes) {
      vacantUnitsPromise = this.unitRepository
        .createQueryBuilder('u')
        .select(['u.id', 'u.unitNumber', 'u.updatedAt'])
        .innerJoin('assets', 'ast', 'u.asset_id = ast.id')
        .innerJoin('localities', 'loc', 'ast.locality_id = loc.id')
        .innerJoin('cities', 'ci', 'loc.city_id = ci.id')
        .where('u.company_id = :companyId', { companyId })
        .andWhere('u.status = :status', { status: UnitStatus.AVAILABLE })
        .andWhere('u.deleted_at IS NULL')
        .andWhere('u.updated_at < :days30Ago', { days30Ago })
        .andWhere('ci.region_code IN (:...regionCodes)', { regionCodes })
        .take(20)
        .getMany();
    } else {
      vacantUnitsPromise = this.unitRepository.find({
        where: {
          companyId,
          status: UnitStatus.AVAILABLE,
          updatedAt: LessThan(days30Ago),
          deletedAt: IsNull(),
        },
        select: ['id', 'unitNumber', 'updatedAt'],
        take: 20,
      });
    }

    const [
      untouchedLeads48h,
      untouchedLeads24h,
      stalledLeads,
      overdueFollowups,
      vacantUnits,
    ] = await Promise.all([
      this.leadRepository.find({
        where: {
          ...leadWhere,
          status: LeadStatus.NEW,
          createdAt: LessThan(hours48Ago),
        },
        select: ['id', 'contactId', 'createdAt'],
        relations: ['contact'],
        take: 20,
      }),
      this.leadRepository.find({
        where: {
          ...leadWhere,
          status: LeadStatus.NEW,
          createdAt: LessThan(hours24Ago),
        },
        select: ['id', 'contactId', 'createdAt'],
        relations: ['contact'],
        take: 20,
      }),
      this.leadRepository.find({
        where: {
          ...leadWhere,
          status: LeadStatus.NEGOTIATING,
          updatedAt: LessThan(days14Ago),
        },
        select: ['id', 'contactId', 'status', 'updatedAt'],
        relations: ['contact'],
        take: 20,
      }),
      overdueQb.getMany(),
      vacantUnitsPromise,
    ]);

    const flags: RedFlag[] = [];

    for (const lead of untouchedLeads48h) {
      flags.push({
        type: 'UNTOUCHED_LEAD_48H',
        severity: 'HIGH',
        message: `${this.leadFlagName(lead)} untouched for 48+ hours`,
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.createdAt,
      });
    }

    // Only add 24h leads that aren't already in 48h list
    const ids48h = new Set(untouchedLeads48h.map((l) => l.id));
    for (const lead of untouchedLeads24h) {
      if (ids48h.has(lead.id)) continue;
      flags.push({
        type: 'UNTOUCHED_LEAD_24H',
        severity: 'MEDIUM',
        message: `${this.leadFlagName(lead)} untouched for 24+ hours`,
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.createdAt,
      });
    }

    for (const lead of stalledLeads) {
      flags.push({
        type: 'STALLED_PIPELINE',
        severity: 'MEDIUM',
        message: `${this.leadFlagName(lead)} stuck in ${lead.status} for 14+ days`,
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.updatedAt,
      });
    }

    for (const lead of overdueFollowups) {
      flags.push({
        type: 'OVERDUE_FOLLOWUP',
        severity: 'MEDIUM',
        message: `${this.leadFlagName(lead)} in ${lead.status}, no update for 7+ days`,
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.updatedAt,
      });
    }

    for (const unit of vacantUnits) {
      flags.push({
        type: 'LONG_VACANT',
        severity: 'LOW',
        message: `Property ${unit.unitNumber} vacant for 30+ days`,
        entityType: 'Unit',
        entityId: unit.id,
        createdAt: unit.updatedAt,
      });
    }

    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    flags.sort((a, b) => {
      const sevDiff =
        (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return flags;
  }

  async getActivityFeed(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<ActivityFeedItem[]> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return [];
    }

    // A NULL region marks a global row such as billing, which stays admin-only.
    const regionWhere: FindOptionsWhere<AuditLog>[] | undefined = regionCodes
      ? [
          { companyId, regionCode: In(regionCodes) },
          ...(caller && isAdminRole(caller.role)
            ? [{ companyId, regionCode: IsNull() }]
            : []),
        ]
      : undefined;

    const logs = await this.auditLogRepository.find({
      where: regionWhere ?? { companyId },
      order: { createdAt: 'DESC' },
      take: 25,
      select: ['id', 'action', 'entityType', 'entityId', 'userId', 'createdAt'],
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.userId,
      createdAt: log.createdAt,
    }));
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

  async getLeadOwnership(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<LeadOwnership> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no leads, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return {
        agents: [],
        pipeline: OPEN_LEAD_STAGES.map((stage) => ({ stage, count: 0 })),
        won: 0,
        lost: 0,
        unassignedOpen: 0,
      };
    }

    const closedSince = subtractDaysFromInstant(
      new Date(),
      OWNERSHIP_CLOSED_WINDOW_DAYS,
    );

    // Staff are filtered by their own assignments, matching the agent search.
    const agentListed = regionCodes
      ? `(u.role = :agentRole AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(u.region_codes) rc WHERE rc = ANY(:regionArray)))`
      : 'u.role = :agentRole';

    // Scope sits in the JOIN, not the WHERE, so an agent holding nothing still returns a row.
    const joinOn = [
      'l.assignedTo = u.id',
      'l.companyId = :companyId',
      '(l.status IN (:...openStages) OR l.stageEnteredAt >= :closedSince)',
    ];
    if (regionCodes) joinOn.push('l.regionCode IN (:...regionCodes)');

    const agentQb = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(Lead, 'l', joinOn.join(' AND '))
      .select('u.id', 'agentId')
      .addSelect('u.name', 'agentName')
      .addSelect(
        'SUM(CASE WHEN l.status = :stageNew THEN 1 ELSE 0 END)::int',
        'newCount',
      )
      .addSelect(
        'SUM(CASE WHEN l.status = :stageContacted THEN 1 ELSE 0 END)::int',
        'contactedCount',
      )
      .addSelect(
        'SUM(CASE WHEN l.status = :stageViewing THEN 1 ELSE 0 END)::int',
        'viewingCount',
      )
      .addSelect(
        'SUM(CASE WHEN l.status = :stageNegotiating THEN 1 ELSE 0 END)::int',
        'negotiatingCount',
      )
      // The join already bounds these to the closed window.
      .addSelect(
        'SUM(CASE WHEN l.status = :stageWon THEN 1 ELSE 0 END)::int',
        'wonCount',
      )
      .addSelect(
        'SUM(CASE WHEN l.status = :stageLost THEN 1 ELSE 0 END)::int',
        'lostCount',
      )
      .where('u.companyId = :companyId')
      .andWhere('u.isActive = true')
      .groupBy('u.id')
      .addGroupBy('u.name')
      .addGroupBy('u.role')
      // In-region agents always list; anyone else appears only while holding a counted lead,
      // which keeps the rows summing to the assigned total no matter where they are assigned.
      .having(`${agentListed} OR COUNT(l.id) > 0`)
      .setParameters({
        companyId,
        closedSince,
        openStages: OPEN_LEAD_STAGES,
        stageNew: LeadStatus.NEW,
        stageContacted: LeadStatus.CONTACTED,
        stageViewing: LeadStatus.VIEWING,
        stageNegotiating: LeadStatus.NEGOTIATING,
        stageWon: LeadStatus.WON,
        stageLost: LeadStatus.LOST,
        agentRole: Role.AGENT,
      });

    if (regionCodes) {
      agentQb.setParameter('regionCodes', regionCodes);
      agentQb.setParameter('regionArray', regionCodes);
    }

    // One census covers the company pipeline, the closed window and the unassigned tally.
    const censusQb = this.leadRepository
      .createQueryBuilder('l')
      .select('l.status', 'stage')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect(
        'SUM(CASE WHEN l.assignedTo IS NULL THEN 1 ELSE 0 END)::int',
        'unassigned',
      )
      .where('l.companyId = :companyId', { companyId })
      .andWhere(
        '(l.status IN (:...openStages) OR l.stageEnteredAt >= :closedSince)',
        { openStages: OPEN_LEAD_STAGES, closedSince },
      )
      .groupBy('l.status');

    if (regionCodes)
      censusQb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });

    const [rows, census] = await Promise.all([
      agentQb.getRawMany(),
      censusQb.getRawMany(),
    ]);

    const agents = rows
      .map((row) => {
        const stages: PipelineFunnel[] = [
          { stage: LeadStatus.NEW, count: Number(row.newCount) },
          { stage: LeadStatus.CONTACTED, count: Number(row.contactedCount) },
          { stage: LeadStatus.VIEWING, count: Number(row.viewingCount) },
          {
            stage: LeadStatus.NEGOTIATING,
            count: Number(row.negotiatingCount),
          },
        ];

        return {
          agentId: row.agentId as string,
          agentName: row.agentName as string,
          openTotal: stages.reduce((sum, s) => sum + s.count, 0),
          stages,
          won: Number(row.wonCount),
          lost: Number(row.lostCount),
        };
      })
      .sort(
        (a, b) =>
          b.openTotal - a.openTotal ||
          (a.agentName ?? '').localeCompare(b.agentName ?? ''),
      );

    const censusByStage = new Map<string, { count: number; unassigned: number }>(
      census.map((row) => [
        row.stage as string,
        { count: Number(row.count), unassigned: Number(row.unassigned) },
      ]),
    );

    return {
      agents,
      pipeline: OPEN_LEAD_STAGES.map((stage) => ({
        stage,
        count: censusByStage.get(stage)?.count ?? 0,
      })),
      won: censusByStage.get(LeadStatus.WON)?.count ?? 0,
      lost: censusByStage.get(LeadStatus.LOST)?.count ?? 0,
      unassignedOpen: OPEN_LEAD_STAGES.reduce(
        (sum, stage) => sum + (censusByStage.get(stage)?.unassigned ?? 0),
        0,
      ),
    };
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
