import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { LeadActivity, ActivityType } from '../leads/entities/lead-activity.entity';
import { Transaction, TransactionStatus, TransactionType } from '../financial/entities/transaction.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque, ChequeStatus } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

export interface DashboardKpis {
  totalLeads: number;
  wonLeads: number;
  totalUnits: number;
  monthlyRevenue: number;
  activeLeases: number;
  pendingCheques: number;
}

export interface AgentPerformance {
  agentId: string;
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
  conversionRate: number;
  commissionsEarned: number;
  currency: string;
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
  entityId: string;
  userId: string | null;
  createdAt: Date;
}

export interface PipelineFunnel {
  stage: string;
  count: number;
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
  ) {}

  async getDashboardKpis(companyId: string): Promise<DashboardKpis> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalLeads, wonLeads, totalUnits, revenueResult, activeLeases, pendingCheques] =
      await Promise.all([
        this.leadRepository.count({ where: { companyId } }),
        this.leadRepository.count({ where: { companyId, status: LeadStatus.WON } }),
        this.unitRepository.count({ where: { companyId } }),
        this.transactionRepository
          .createQueryBuilder('t')
          .select('COALESCE(SUM(t.amount), 0)', 'total')
          .where('t.companyId = :companyId', { companyId })
          .andWhere('t.type = :type', { type: TransactionType.INCOME })
          .andWhere('t.status = :status', { status: TransactionStatus.COMPLETED })
          .andWhere('t.createdAt >= :startOfMonth', { startOfMonth })
          .getRawOne(),
        this.leaseRepository.count({ where: { companyId, status: LeaseStatus.ACTIVE } }),
        this.chequeRepository.count({ where: { companyId, status: ChequeStatus.PENDING } }),
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

  async getAgentPerformance(companyId: string): Promise<AgentPerformance[]> {
    const [leadStats, commissionStats] = await Promise.all([
      this.leadRepository
        .createQueryBuilder('l')
        .select('l.assignedTo', 'agentId')
        .addSelect('COUNT(*)::int', 'leadsAssigned')
        .addSelect("SUM(CASE WHEN l.status = :won THEN 1 ELSE 0 END)::int", 'leadsWon')
        .addSelect("SUM(CASE WHEN l.status = :lost THEN 1 ELSE 0 END)::int", 'leadsLost')
        .where('l.companyId = :companyId', { companyId })
        .andWhere('l.assignedTo IS NOT NULL')
        .setParameter('won', LeadStatus.WON)
        .setParameter('lost', LeadStatus.LOST)
        .groupBy('l.assignedTo')
        .getRawMany(),
      this.commissionRepository
        .createQueryBuilder('c')
        .select('c.agentId', 'agentId')
        .addSelect('COALESCE(SUM(c.commissionAmount), 0)', 'commissionsEarned')
        .where('c.companyId = :companyId', { companyId })
        .groupBy('c.agentId')
        .getRawMany(),
    ]);

    const agentMap = new Map<string, AgentPerformance>();

    for (const row of leadStats) {
      agentMap.set(row.agentId, {
        agentId: row.agentId,
        leadsAssigned: Number(row.leadsAssigned),
        leadsWon: Number(row.leadsWon),
        leadsLost: Number(row.leadsLost),
        conversionRate: 0,
        commissionsEarned: 0,
        currency: 'AED',
      });
    }

    for (const row of commissionStats) {
      if (agentMap.has(row.agentId)) {
        agentMap.get(row.agentId)!.commissionsEarned = Number(row.commissionsEarned);
      } else {
        agentMap.set(row.agentId, {
          agentId: row.agentId,
          leadsAssigned: 0,
          leadsWon: 0,
          leadsLost: 0,
          conversionRate: 0,
          commissionsEarned: Number(row.commissionsEarned),
          currency: 'AED',
        });
      }
    }

    return Array.from(agentMap.values()).map((p) => ({
      ...p,
      conversionRate: p.leadsAssigned > 0 ? Math.round((p.leadsWon / p.leadsAssigned) * 100) : 0,
    }));
  }

  async getRedFlags(companyId: string): Promise<RedFlag[]> {
    const now = new Date();
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const days14Ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      untouchedLeads48h,
      untouchedLeads24h,
      stalledLeads,
      overdueFollowups,
      vacantUnits,
    ] = await Promise.all([
      // Leads sitting in NEW for 48+ hours
      this.leadRepository.find({
        where: {
          companyId,
          status: LeadStatus.NEW,
          createdAt: LessThan(hours48Ago),
        },
        select: ['id', 'firstName', 'lastName', 'createdAt'],
        take: 20,
      }),
      // Leads sitting in NEW for 24+ hours (but less than 48)
      this.leadRepository.find({
        where: {
          companyId,
          status: LeadStatus.NEW,
          createdAt: LessThan(hours24Ago),
        },
        select: ['id', 'firstName', 'lastName', 'createdAt'],
        take: 20,
      }),
      // Leads stuck in same pipeline stage for 14+ days
      this.leadRepository.find({
        where: {
          companyId,
          status: LeadStatus.NEGOTIATING,
          updatedAt: LessThan(days14Ago),
        },
        select: ['id', 'firstName', 'lastName', 'status', 'updatedAt'],
        take: 20,
      }),
      // Leads in active stages not updated for 7+ days
      this.leadRepository
        .createQueryBuilder('l')
        .select(['l.id', 'l.firstName', 'l.lastName', 'l.status', 'l.updatedAt'])
        .where('l.companyId = :companyId', { companyId })
        .andWhere('l.status IN (:...statuses)', {
          statuses: [LeadStatus.CONTACTED, LeadStatus.VIEWING],
        })
        .andWhere('l.updatedAt < :days7Ago', { days7Ago })
        .take(20)
        .getMany(),
      // Units vacant for 30+ days
      this.unitRepository.find({
        where: {
          companyId,
          status: UnitStatus.AVAILABLE,
          updatedAt: LessThan(days30Ago),
        },
        select: ['id', 'unitNumber', 'updatedAt'],
        take: 20,
      }),
    ]);

    const flags: RedFlag[] = [];

    for (const lead of untouchedLeads48h) {
      flags.push({
        type: 'UNTOUCHED_LEAD_48H',
        severity: 'HIGH',
        message: `${lead.firstName} ${lead.lastName || ''} untouched for 48+ hours`.trim(),
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
        message: `${lead.firstName} ${lead.lastName || ''} untouched for 24+ hours`.trim(),
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.createdAt,
      });
    }

    for (const lead of stalledLeads) {
      flags.push({
        type: 'STALLED_PIPELINE',
        severity: 'MEDIUM',
        message: `${lead.firstName} ${lead.lastName || ''} stuck in ${lead.status} for 14+ days`.trim(),
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.updatedAt,
      });
    }

    for (const lead of overdueFollowups) {
      flags.push({
        type: 'OVERDUE_FOLLOWUP',
        severity: 'MEDIUM',
        message: `${lead.firstName} ${lead.lastName || ''} in ${lead.status}, no update for 7+ days`.trim(),
        entityType: 'Lead',
        entityId: lead.id,
        createdAt: lead.updatedAt,
      });
    }

    for (const unit of vacantUnits) {
      flags.push({
        type: 'LONG_VACANT',
        severity: 'LOW',
        message: `Unit ${unit.unitNumber} vacant for 30+ days`,
        entityType: 'Unit',
        entityId: unit.id,
        createdAt: unit.updatedAt,
      });
    }

    // Sort by severity (HIGH first) then by date (oldest first)
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    flags.sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return flags;
  }

  async getActivityFeed(companyId: string): Promise<ActivityFeedItem[]> {
    const logs = await this.auditLogRepository.find({
      where: { companyId },
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

  async getPipelineFunnel(companyId: string): Promise<PipelineFunnel[]> {
    const results = await this.leadRepository
      .createQueryBuilder('l')
      .select('l.status', 'stage')
      .addSelect('COUNT(*)::int', 'count')
      .where('l.companyId = :companyId', { companyId })
      .groupBy('l.status')
      .getRawMany();

    // Return in pipeline order
    const order = [
      LeadStatus.NEW,
      LeadStatus.CONTACTED,
      LeadStatus.VIEWING,
      LeadStatus.NEGOTIATING,
      LeadStatus.WON,
      LeadStatus.LOST,
    ];
    const countMap = new Map(results.map((r) => [r.stage, Number(r.count)]));

    return order.map((stage) => ({
      stage,
      count: countMap.get(stage) ?? 0,
    }));
  }

  async getBottlenecks(companyId: string): Promise<StageBottleneck[]> {
    const now = new Date();

    // Get active leads (not WON/LOST) with stageEnteredAt set, grouped by status
    const results = await this.leadRepository
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
      .setParameter('now', now)
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

  async getResponseTimeMetrics(companyId: string): Promise<AgentResponseTime[]> {
    // Find the first STATUS_CHANGE activity per lead, then calculate diff from lead.createdAt
    // Uses lead_activities table for historical accuracy
    const results = await this.activityRepository
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
      .andWhere('a.type = :statusChangeType', { statusChangeType: ActivityType.STATUS_CHANGE })
      .andWhere('l.assigned_to IS NOT NULL')
      .setParameter('companyId', companyId)
      .setParameter('statusChangeType', ActivityType.STATUS_CHANGE)
      .groupBy('l.assigned_to')
      .getRawMany();

    return results.map((r) => ({
      agentId: r.agentId,
      avgResponseMinutes: Number(r.avgResponseMinutes),
      totalLeadsHandled: Number(r.totalLeadsHandled),
    }));
  }

  async getAchievements(companyId: string): Promise<Achievement[]> {
    const agents = await this.getAgentPerformance(companyId);
    const achievements: Achievement[] = [];

    if (agents.length === 0) return achievements;

    // Best conversion rate
    const bestConverter = agents.reduce((best, a) =>
      a.conversionRate > best.conversionRate ? a : best, agents[0]);
    if (bestConverter.conversionRate > 0) {
      achievements.push({
        type: 'BEST_CONVERSION',
        agentId: bestConverter.agentId,
        message: `Highest conversion rate: ${bestConverter.conversionRate}%`,
        value: bestConverter.conversionRate,
      });
    }

    // Most leads won
    const mostWins = agents.reduce((best, a) =>
      a.leadsWon > best.leadsWon ? a : best, agents[0]);
    if (mostWins.leadsWon > 0) {
      achievements.push({
        type: 'MOST_WINS',
        agentId: mostWins.agentId,
        message: `Most leads won: ${mostWins.leadsWon}`,
        value: mostWins.leadsWon,
      });
    }

    // Top earner
    const topEarner = agents.reduce((best, a) =>
      a.commissionsEarned > best.commissionsEarned ? a : best, agents[0]);
    if (topEarner.commissionsEarned > 0) {
      achievements.push({
        type: 'TOP_EARNER',
        agentId: topEarner.agentId,
        message: `Top commission earner: AED ${topEarner.commissionsEarned.toLocaleString()}`,
        value: topEarner.commissionsEarned,
      });
    }

    // Most active (most leads assigned)
    const mostActive = agents.reduce((best, a) =>
      a.leadsAssigned > best.leadsAssigned ? a : best, agents[0]);
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

  async getAgentComparison(companyId: string): Promise<AgentComparison[]> {
    const agents = await this.getAgentPerformance(companyId);

    // Rank by conversion rate, then by leads won as tiebreaker
    const sorted = [...agents].sort((a, b) => {
      if (b.conversionRate !== a.conversionRate) return b.conversionRate - a.conversionRate;
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
}
