import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  In,
  LessThan,
  Between,
  FindOptionsWhere,
} from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { Company } from '../companies/entities/company.entity';
import { effectiveRegionCodes } from '../../shared/utils/region-visibility.util';
import {
  paginationOptions,
  pageSkip,
} from '../../shared/utils/pagination.util';

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
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    companyId: string,
    dto: CreateTransactionDto,
    activeRegionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    if (dto.unitId) {
      const unit = await this.unitRepository.findOne({
        where: { id: dto.unitId, companyId },
        select: { id: true, deletedAt: true },
      });
      if (!unit) {
        throw new NotFoundException('Unit not found');
      }
      if (unit.deletedAt) {
        throw new ConflictException('This unit is archived.');
      }
    }
    const transaction = this.transactionRepository.create({
      ...dto,
      companyId,
      regionCode: await this.resolveTransactionRegion(
        companyId,
        dto.unitId,
        activeRegionCode,
        caller,
      ),
    });
    return this.dataSource.transaction(async (manager) => {
      await this.assertUnitNotArchivedLocked(
        manager,
        dto.unitId,
        companyId,
        'This unit is archived.',
      );
      return manager.getRepository(Transaction).save(transaction);
    });
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    type?: string,
    ownerId?: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    if (regionCodes) {
      // A row with no region is invisible until the region selector gains a
      // Show All option (AAMIR, 2026-09-16).
      const qb = this.transactionRepository
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.unit', 'unit')
        .where('t.companyId = :companyId', { companyId })
        .andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });

      if (ownerId) {
        qb.andWhere('unit.ownerId = :ownerId', { ownerId });
      }

      if (type) {
        qb.andWhere('t.type = :type', { type });
      }

      qb.skip(pageSkip(page, limit)).take(limit).orderBy('t.createdAt', 'DESC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    const where: FindOptionsWhere<Transaction> = { companyId };

    if (ownerId) {
      where.unit = { ownerId };
    }

    if (type) {
      where.type = type as TransactionType;
    }

    const [data, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['unit'],
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      throw new NotFoundException('Transaction not found');
    }

    const transaction = await this.transactionRepository.findOne({
      where: {
        id,
        companyId,
        ...(regionCodes ? { regionCode: In(regionCodes) } : {}),
      },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateTransactionDto,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<Transaction> {
    await this.findOne(id, companyId, regionCode, caller);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Transaction);
      const transaction = await repo.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      await this.assertUnitNotArchivedLocked(
        manager,
        transaction.unitId,
        companyId,
        'This unit is archived. Its records can no longer be edited.',
      );

      if (dto.status === TransactionStatus.COMPLETED && !transaction.paidAt) {
        transaction.paidAt = new Date();
      }

      Object.assign(transaction, dto);
      return repo.save(transaction);
    });
  }

  // Unit region first. A caller-supplied region is validated the same way a
  // cheque validates its own; with neither, the row stays unregioned.
  private async resolveTransactionRegion(
    companyId: string,
    unitId: string | null | undefined,
    regionCode: string | undefined,
    caller?: RegionScope,
  ): Promise<string | null> {
    const unitRegion = await this.regionOfUnit(unitId, companyId);
    if (unitRegion) {
      return unitRegion;
    }
    if (!regionCode) {
      return null;
    }
    return resolveRegionCode(
      this.companyRepository,
      companyId,
      regionCode,
      caller,
    );
  }

  // A transaction takes the region of its unit, the same chain the cheque and
  // work order columns were backfilled from.
  private async regionOfUnit(
    unitId: string | null | undefined,
    companyId: string,
  ): Promise<string | undefined> {
    if (!unitId) {
      return undefined;
    }
    const row = await this.unitRepository
      .createQueryBuilder('u')
      .innerJoin('u.asset', 'a')
      .innerJoin('a.locality', 'loc')
      .innerJoin('loc.city', 'ci')
      .select('ci.regionCode', 'regionCode')
      .where('u.id = :unitId', { unitId })
      .andWhere('u.companyId = :companyId', { companyId })
      .getRawOne<{ regionCode: string }>();
    return row?.regionCode ?? undefined;
  }

  // FOR SHARE so archiveUnit cannot commit in between.
  private async assertUnitNotArchivedLocked(
    manager: EntityManager,
    unitId: string | null | undefined,
    companyId: string,
    message: string,
  ): Promise<void> {
    if (!unitId) {
      return;
    }
    const unit = await manager.findOne(Unit, {
      where: { id: unitId, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    if (unit.deletedAt) {
      throw new ConflictException(message);
    }
  }

  async getSummary(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<TransactionSummary> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return { totalIncome: 0, totalExpense: 0, net: 0 };
    }

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .select(
        'COALESCE(SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END), 0)',
        'totalIncome',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END), 0)',
        'totalExpense',
      )
      .where(
        't.companyId = :companyId AND t.status NOT IN (:...excludedStatuses)',
        {
          companyId,
          excludedStatuses: [
            TransactionStatus.CANCELLED,
            TransactionStatus.FAILED,
          ],
        },
      )
      .setParameters({
        income: TransactionType.INCOME,
        expense: TransactionType.EXPENSE,
      });

    if (regionCodes) {
      qb.andWhere('t.regionCode IN (:...regionCodes)', { regionCodes });
    }

    const result = await qb.getRawOne();

    const totalIncome = Number(result?.totalIncome ?? 0);
    const totalExpense = Number(result?.totalExpense ?? 0);

    return {
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  }

  async getDepositReminders(
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ): Promise<{
    overdue: Transaction[];
    dueToday: Transaction[];
    dueThisWeek: Transaction[];
    dueThisMonth: Transaction[];
  }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    if (regionCodes?.length === 0) {
      return { overdue: [], dueToday: [], dueThisWeek: [], dueThisMonth: [] };
    }

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
      ...(regionCodes ? { regionCode: In(regionCodes) } : {}),
    };

    const [overdue, dueToday, dueThisWeek, dueThisMonth] = await Promise.all([
      this.transactionRepository.find({
        where: { ...baseWhere, dueDate: LessThan(today) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.transactionRepository.find({
        where: { ...baseWhere, dueDate: Between(today, tomorrow) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.transactionRepository.find({
        where: { ...baseWhere, dueDate: Between(tomorrow, endOfWeek) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.transactionRepository.find({
        where: { ...baseWhere, dueDate: Between(endOfWeek, endOfMonth) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
    ]);

    return { overdue, dueToday, dueThisWeek, dueThisMonth };
  }
}
