import { Repository, SelectQueryBuilder } from 'typeorm';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../shared/enums/roles.enum';
import { subtractDaysFromInstant } from '../../shared/utils/region-time.util';
import type { LeadOwnership, PipelineFunnel } from './reports.service';

export const OPEN_LEAD_STAGES = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.VIEWING,
  LeadStatus.NEGOTIATING,
];

/** Closed leads age out of lead ownership so the panel reads as current throughput. */
const OWNERSHIP_CLOSED_WINDOW_DAYS = 30;

/** One row per listed user, counted over the leads the join attached to them. */
export interface AgentLoadRow {
  agentId: string;
  agentName: string;
  newCount: number;
  contactedCount: number;
  viewingCount: number;
  negotiatingCount: number;
  wonCount: number;
  lostCount: number;
}

/** One row per stage across the whole company, with its unassigned share. */
export interface CensusRow {
  stage: string;
  count: number;
  unassigned: number;
}

/** Both queries take the same instant so the roster and the census bound closed leads alike. */
export function closedWindowStart(): Date {
  return subtractDaysFromInstant(new Date(), OWNERSHIP_CLOSED_WINDOW_DAYS);
}

export function agentLoadQuery(
  userRepository: Repository<User>,
  companyId: string,
  regionCodes: string[] | null,
  closedSince: Date,
): SelectQueryBuilder<User> {
  // Staff are filtered by their own assignments, matching the agent search.
  const agentListed = regionCodes
    ? `(u.role = :agentRole AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(u.regionCodes) rc WHERE rc = ANY(:regionArray)))`
    : 'u.role = :agentRole';

  // Scope sits in the JOIN, not the WHERE, so an agent holding nothing still returns a row.
  const joinOn = [
    'l.assignedTo = u.id',
    'l.companyId = :companyId',
    '(l.status IN (:...openStages) OR l.stageEnteredAt >= :closedSince)',
  ];
  if (regionCodes) joinOn.push('l.regionCode IN (:...regionCodes)');

  const qb = userRepository
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
    // Idle in-region agents still list; any other holder lists because a counted lead's holder is always active.
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
    qb.setParameter('regionCodes', regionCodes);
    qb.setParameter('regionArray', regionCodes);
  }

  return qb;
}

/** One census covers the company pipeline, the closed window and the unassigned tally. */
export function leadCensusQuery(
  leadRepository: Repository<Lead>,
  companyId: string,
  regionCodes: string[] | null,
  closedSince: Date,
): SelectQueryBuilder<Lead> {
  const qb = leadRepository
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
    qb.andWhere('l.regionCode IN (:...regionCodes)', { regionCodes });

  return qb;
}

export function emptyLeadOwnership(): LeadOwnership {
  return {
    agents: [],
    pipeline: OPEN_LEAD_STAGES.map((stage) => ({ stage, count: 0 })),
    won: 0,
    lost: 0,
    unassignedOpen: 0,
  };
}

export function shapeLeadOwnership(
  rows: AgentLoadRow[],
  census: CensusRow[],
): LeadOwnership {
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
        agentId: row.agentId,
        agentName: row.agentName,
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
      row.stage,
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
