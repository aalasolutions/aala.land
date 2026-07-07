import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { REGION_FILTER_SUBQUERY } from '../../shared/utils/region-filter.util';
import { paginationOptions } from '../../shared/utils/pagination.util';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    private readonly dataSource: DataSource,
  ) { }

  /**
   * Assert no other ACTIVE lease already exists on this unit, INSIDE the locked
   * transaction, before a lifecycle transition creates or keeps one ACTIVE.
   * Postgres runs at READ COMMITTED with no version columns, so renew/terminate
   * are otherwise check-then-act read-modify-save sequences: two concurrent
   * renews on the same unit both read the old lease as ACTIVE, both pass the
   * guard, and each creates a successor -> two ACTIVE leases on one unit (race
   * audit 2026-07-07, P4). The lock on the transitioning lease row serializes
   * the two flows; this count is the invariant re-check under that lock. A
   * partial unique index leases(unit_id) WHERE status='ACTIVE' (migration
   * 1779500000043) is the database backstop.
   */
  private async assertNoOtherActiveLease(
    manager: EntityManager,
    unitId: string,
    companyId: string,
    excludeLeaseId: string,
  ): Promise<void> {
    const existing = await manager
      .createQueryBuilder(Lease, 'l')
      .where('l.unitId = :unitId', { unitId })
      .andWhere('l.companyId = :companyId', { companyId })
      .andWhere('l.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('l.id != :excludeLeaseId', { excludeLeaseId })
      .getCount();
    if (existing > 0) {
      throw new BadRequestException('This unit already has an active lease');
    }
  }

  async create(companyId: string, dto: CreateLeaseDto): Promise<Lease> {
    const lease = this.leaseRepository.create({ ...dto, companyId });
    return this.leaseRepository.save(lease);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    if (regionCode) {
      const qb = this.leaseRepository
        .createQueryBuilder('l')
        .where('l.companyId = :companyId', { companyId })
        .andWhere(
          `l.unitId IN (${REGION_FILTER_SUBQUERY})`,
          { regionCode },
        )
        .skip((page - 1) * limit)
        .take(limit)
        .orderBy('l.createdAt', 'DESC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    const [data, total] = await this.leaseRepository.findAndCount({
      where: { companyId },
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Lease> {
    const lease = await this.leaseRepository.findOne({ where: { id, companyId } });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  async findByUnit(unitId: string, companyId: string): Promise<Lease[]> {
    return this.leaseRepository.find({
      where: { unitId, companyId },
      order: { startDate: 'DESC' },
    });
  }

  async update(id: string, companyId: string, dto: UpdateLeaseDto): Promise<Lease> {
    return this.dataSource.transaction(async (manager) => {
      const lease = await manager.findOne(Lease, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lease) {
        throw new NotFoundException('Lease not found');
      }

      if (dto.status && dto.status !== lease.status) {
        const terminal = [LeaseStatus.TERMINATED, LeaseStatus.RENEWED];
        if (terminal.includes(lease.status)) {
          throw new BadRequestException(
            `Cannot change status of a ${lease.status} lease`,
          );
        }
      }

      Object.assign(lease, dto);

      // update() is the write path that flips a lease TO ACTIVE. Under the row
      // lock, re-check that no other lease on the same unit is already ACTIVE so
      // two DRAFT->ACTIVE flips cannot both land (matches the partial unique
      // index leases(unit_id) WHERE status='ACTIVE').
      if (lease.status === LeaseStatus.ACTIVE) {
        await this.assertNoOtherActiveLease(manager, lease.unitId, companyId, id);
      }

      return manager.save(Lease, lease);
    });
  }

  async renew(id: string, companyId: string, dto: CreateLeaseDto): Promise<{ oldLease: Lease; newLease: Lease }> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the lease row FOR UPDATE, then re-check the status guard under the
      // lock: two concurrent renews serialize here, so only the first flips the
      // lease to RENEWED and the second sees the new status and is rejected.
      const oldLease = await manager.findOne(Lease, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!oldLease) {
        throw new NotFoundException('Lease not found');
      }
      if (oldLease.status !== LeaseStatus.ACTIVE && oldLease.status !== LeaseStatus.EXPIRED) {
        throw new BadRequestException('Only ACTIVE or EXPIRED leases can be renewed');
      }

      oldLease.status = LeaseStatus.RENEWED;
      const savedOldLease = await manager.save(Lease, oldLease);

      // The successor is ACTIVE only if the DTO says so (default DRAFT). Guard
      // against a second ACTIVE lease landing on the same unit under this lock.
      const newLease = manager.create(Lease, { ...dto, companyId });
      if (newLease.status === LeaseStatus.ACTIVE) {
        await this.assertNoOtherActiveLease(manager, newLease.unitId, companyId, id);
      }
      const savedNewLease = await manager.save(Lease, newLease);

      return { oldLease: savedOldLease, newLease: savedNewLease };
    });
  }

  async terminate(id: string, companyId: string): Promise<Lease> {
    return this.dataSource.transaction(async (manager) => {
      const lease = await manager.findOne(Lease, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lease) {
        throw new NotFoundException('Lease not found');
      }
      if (lease.status !== LeaseStatus.ACTIVE) {
        throw new BadRequestException('Only ACTIVE leases can be terminated');
      }
      lease.status = LeaseStatus.TERMINATED;
      return manager.save(Lease, lease);
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const lease = await this.findOne(id, companyId);
    await this.leaseRepository.remove(lease);
  }
}
