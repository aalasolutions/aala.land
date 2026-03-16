import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between, LessThanOrEqual, MoreThan, FindOptionsWhere } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

export interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

@Injectable()
export class FinancialService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) { }

  async create(companyId: string, dto: CreateTransactionDto): Promise<Transaction> {
    const transaction = this.transactionRepository.create({ ...dto, companyId });
    return this.transactionRepository.save(transaction);
  }

  async findAll(companyId: string, page = 1, limit = 20, ownerId?: string, regionCode?: string): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    if (regionCode) {
      // Show transactions that either belong to a unit in the region OR have no unit linked
      const qb = this.transactionRepository
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.unit', 'unit')
        .where('t.companyId = :companyId', { companyId })
        .andWhere(
          '(t.unitId IS NULL OR t.unitId IN ' +
          '(SELECT u.id FROM units u ' +
          'INNER JOIN buildings b ON u.building_id = b.id ' +
          'INNER JOIN property_areas pa ON b.area_id = pa.id ' +
          'WHERE pa.region_code = :regionCode))',
          { regionCode },
        );

      if (ownerId) {
        qb.andWhere('unit.ownerId = :ownerId', { ownerId });
      }

      qb.skip((page - 1) * limit)
        .take(limit)
        .orderBy('t.createdAt', 'DESC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    const where: FindOptionsWhere<Transaction> = { companyId };

    if (ownerId) {
      where.unit = { ownerId };
    }

    const [data, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['unit'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({ where: { id, companyId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(id: string, companyId: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const transaction = await this.findOne(id, companyId);

    if (dto.status === TransactionStatus.COMPLETED && !transaction.paidAt) {
      transaction.paidAt = new Date();
    }

    Object.assign(transaction, dto);
    return this.transactionRepository.save(transaction);
  }

  async getSummary(companyId: string): Promise<TransactionSummary> {
    const transactions = await this.transactionRepository.find({ where: { companyId } });

    let totalIncome = 0;
    let totalExpense = 0;

    for (const t of transactions) {
      const amount = parseFloat(String(t.amount));
      if (t.type === TransactionType.INCOME) {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
    }

    return {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  }

  async getDepositReminders(companyId: string): Promise<{
    overdue: Transaction[];
    dueToday: Transaction[];
    dueThisWeek: Transaction[];
    dueThisMonth: Transaction[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const baseWhere = {
      companyId,
      type: TransactionType.INCOME,
      status: TransactionStatus.PENDING,
    };

    const overdue = await this.transactionRepository.find({
      where: { ...baseWhere, dueDate: LessThan(today) },
      order: { dueDate: 'ASC' },
    });

    const dueToday = await this.transactionRepository.find({
      where: { ...baseWhere, dueDate: Between(today, tomorrow) },
      order: { dueDate: 'ASC' },
    });

    const dueThisWeek = await this.transactionRepository.find({
      where: { ...baseWhere, dueDate: Between(tomorrow, endOfWeek) },
      order: { dueDate: 'ASC' },
    });

    const dueThisMonth = await this.transactionRepository.find({
      where: { ...baseWhere, dueDate: Between(endOfWeek, endOfMonth) },
      order: { dueDate: 'ASC' },
    });

    return { overdue, dueToday, dueThisWeek, dueThisMonth };
  }
}
