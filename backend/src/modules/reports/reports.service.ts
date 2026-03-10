import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { Transaction, TransactionStatus, TransactionType } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';

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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,

    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,

    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,

    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,
  ) { }

  async getDashboardKpis(companyId: string): Promise<DashboardKpis> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalLeads, wonLeads, totalUnits, allTransactions] = await Promise.all([
      this.leadRepository.count({ where: { companyId } }),
      this.leadRepository.count({ where: { companyId, status: LeadStatus.WON } }),
      this.unitRepository.count({ where: { companyId } }),
      this.transactionRepository.find({ where: { companyId } }),
    ]);

    const monthlyRevenue = allTransactions
      .filter(
        (t) =>
          t.type === TransactionType.INCOME &&
          t.status === TransactionStatus.COMPLETED &&
          new Date(t.createdAt) >= startOfMonth,
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      totalLeads,
      wonLeads,
      totalUnits,
      monthlyRevenue,
      activeLeases: 0,
      pendingCheques: 0,
    };
  }

  async getAgentPerformance(companyId: string): Promise<AgentPerformance[]> {
    const allLeads = await this.leadRepository.find({ where: { companyId } });
    const allCommissions = await this.commissionRepository.find({ where: { companyId } });

    const agentMap = new Map<string, AgentPerformance>();

    for (const lead of allLeads) {
      if (!lead.assignedTo) continue;

      if (!agentMap.has(lead.assignedTo)) {
        agentMap.set(lead.assignedTo, {
          agentId: lead.assignedTo,
          leadsAssigned: 0,
          leadsWon: 0,
          leadsLost: 0,
          conversionRate: 0,
          commissionsEarned: 0,
          currency: 'AED',
        });
      }

      const perf = agentMap.get(lead.assignedTo)!;
      perf.leadsAssigned++;
      if (lead.status === LeadStatus.WON) perf.leadsWon++;
      if (lead.status === LeadStatus.LOST) perf.leadsLost++;
    }

    for (const commission of allCommissions) {
      if (!agentMap.has(commission.agentId)) {
        agentMap.set(commission.agentId, {
          agentId: commission.agentId,
          leadsAssigned: 0,
          leadsWon: 0,
          leadsLost: 0,
          conversionRate: 0,
          commissionsEarned: 0,
          currency: 'AED',
        });
      }
      const perf = agentMap.get(commission.agentId)!;
      perf.commissionsEarned += Number(commission.commissionAmount);
    }

    return Array.from(agentMap.values()).map((p) => ({
      ...p,
      conversionRate: p.leadsAssigned > 0 ? Math.round((p.leadsWon / p.leadsAssigned) * 100) : 0,
    }));
  }
}
