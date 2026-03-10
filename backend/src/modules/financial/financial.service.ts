import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

export interface TransactionSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  currency: string;
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

  async findAll(companyId: string, page = 1, limit = 20, ownerId?: string): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const where: any = { companyId };

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
      currency: 'AED',
    };
  }
}
