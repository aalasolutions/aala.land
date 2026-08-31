import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { attachDisplayName } from '../../shared/utils/contact.util';
import { ContactsService } from '../contacts/contacts.service';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Lease, LeaseStatus, LeaseType } from './entities/lease.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { Unit } from '../properties/entities/unit.entity';
import {
  REGION_FILTER_SUBQUERY_MULTI,
  unitInRegionsWhere,
} from '../../shared/utils/region-filter.util';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import {
  effectiveRegionCodes,
  scopedRegionCodes,
} from '../../shared/utils/region-visibility.util';

export interface LeaseFilters {
  status?: LeaseStatus;
  type?: LeaseType;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Partial unique index name from migration 1779500000043
 * (leases(unit_id) WHERE status='ACTIVE'). The DB backstop that makes a second
 * ACTIVE lease on a unit physically impossible.
 */
const ACTIVE_LEASE_UNIQUE_INDEX = 'UQ_leases_active_unit';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    private readonly dataSource: DataSource,
    private readonly contactsService: ContactsService,
  ) {}

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

  /**
   * Save a lease that is (or is becoming) ACTIVE, mapping the partial-unique-index
   * violation to a clean 400.
   *
   * assertNoOtherActiveLease + the FOR UPDATE lock serialize transitions on ONE
   * lease row, but two renews driven by DIFFERENT old leases lock different rows
   * and each creates a successor pointed at the SAME unit: neither count sees the
   * other's uncommitted successor, so both pass the guard and the second COMMIT
   * trips UQ_leases_active_unit with a raw 23505 (race audit 2026-07-07, P4-lease
   * follow-up). Translate that unique violation on the active-lease index into the
   * same BadRequestException the in-transaction guard raises, so callers get a 400
   * instead of a 500. Any other error is rethrown untouched.
   */
  private async saveActiveLease(
    manager: EntityManager,
    lease: Lease,
  ): Promise<Lease> {
    try {
      return await manager.save(Lease, lease);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as
          | { code?: string; constraint?: string; detail?: string }
          | undefined;
        const hitsActiveLeaseIndex =
          driverError?.constraint === ACTIVE_LEASE_UNIQUE_INDEX ||
          (driverError?.detail?.includes(ACTIVE_LEASE_UNIQUE_INDEX) ?? false) ||
          error.message.includes(ACTIVE_LEASE_UNIQUE_INDEX);
        if (driverError?.code === '23505' && hitsActiveLeaseIndex) {
          throw new BadRequestException(
            'This unit already has an active lease',
          );
        }
      }
      throw error;
    }
  }

  // A tenant contactId must belong to the lease's company, or loading the
  // contact relation would surface another tenant's PII. The caller is passed on
  // so a contact outside their regions cannot be bound either.
  private async assertContactInCompany(
    contactId: string | null | undefined,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    if (!contactId) return;
    await this.contactsService.findOneEntity(contactId, companyId, caller);
  }

  // A lease carries no region column: its region is its unit's.
  private regionScopedWhere(caller?: RegionScope): FindOptionsWhere<Lease> {
    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Lease not found');
    }
    return scopedCodes ? { unitId: unitInRegionsWhere(scopedCodes) } : {};
  }

  // A lease's region is its unit's, so a unit the caller cannot read must not
  // be bound to one, nor its leases listed.
  private async assertUnitInCallerRegions(
    unitId: string | null | undefined,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    if (!unitId) {
      return;
    }

    const scopedCodes = scopedRegionCodes(caller);
    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Unit not found');
    }

    const where: FindOptionsWhere<Unit> = { id: unitId, companyId };
    if (scopedCodes) {
      where.asset = { locality: { city: { regionCode: In(scopedCodes) } } };
    }

    const unit = await this.unitRepository.findOne({
      where,
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
  }

  private async reloadWithContact(
    manager: EntityManager,
    id: string,
    companyId: string,
  ): Promise<Lease> {
    const lease = await manager.findOne(Lease, {
      where: { id, companyId },
      relations: ['contact'],
    });
    attachDisplayName(lease?.contact ?? null);
    return lease as Lease;
  }

  async create(
    companyId: string,
    dto: CreateLeaseDto,
    caller?: RegionScope,
  ): Promise<Lease> {
    await this.assertContactInCompany(dto.contactId, companyId, caller);
    await this.assertUnitInCallerRegions(dto.unitId, companyId, caller);
    const lease = this.leaseRepository.create({ ...dto, companyId });
    const saved = await this.leaseRepository.save(lease);
    // Re-read of a row this caller just wrote, so it stays unscoped.
    return this.findOne(saved.id, companyId);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
    contactId?: string,
    filters?: LeaseFilters,
    caller?: RegionScope,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const regionCodes = effectiveRegionCodes(regionCode, caller);
    // No readable region means no rows, and an empty IN () is invalid SQL.
    if (regionCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const qb = this.leaseRepository
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.contact', 'tenant')
      .leftJoinAndSelect('l.unit', 'unit')
      .leftJoinAndSelect('unit.asset', 'asset')
      .leftJoinAndSelect('asset.locality', 'locality')
      .where('l.companyId = :companyId', { companyId })
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('l.createdAt', 'DESC');
    if (regionCodes) {
      qb.andWhere(`l.unitId IN (${REGION_FILTER_SUBQUERY_MULTI})`, {
        regionCodes,
      });
    }
    if (contactId) {
      qb.andWhere('l.contactId = :contactId', { contactId });
    }
    if (filters?.status) {
      qb.andWhere('l.status = :status', { status: filters.status });
    }
    if (filters?.type) {
      qb.andWhere('l.type = :type', { type: filters.type });
    }
    if (filters?.search) {
      qb.andWhere(
        `(tenant.firstName ILIKE :s OR tenant.lastName ILIKE :s OR unit.unitNumber ILIKE :s OR l.ejariNumber ILIKE :s)`,
        { s: `%${filters.search}%` },
      );
    }
    if (filters?.dateFrom) {
      qb.andWhere('l.startDate >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters?.dateTo) {
      qb.andWhere("l.startDate < :dateTo::date + interval '1 day'", {
        dateTo: filters.dateTo,
      });
    }

    const [data, total] = await qb.getManyAndCount();

    data.forEach((l) => {
      attachDisplayName(l.contact);
      if (l.unit) {
        const unit = l.unit as typeof l.unit & {
          areaId: string | null;
          areaName: string | null;
          assetName: string | null;
        };
        unit.areaId = l.unit.asset?.locality?.id ?? null;
        unit.areaName = l.unit.asset?.locality?.name ?? null;
        unit.assetName = l.unit.asset?.name ?? null;
      }
    });
    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Lease> {
    const lease = await this.leaseRepository.findOne({
      where: { id, companyId, ...this.regionScopedWhere(caller) },
      relations: ['contact'],
    });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    attachDisplayName(lease.contact);
    return lease;
  }

  async findByUnit(
    unitId: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Lease[]> {
    await this.assertUnitInCallerRegions(unitId, companyId, caller);
    const leases = await this.leaseRepository.find({
      where: { unitId, companyId },
      relations: ['contact'],
      order: { startDate: 'DESC' },
    });
    leases.forEach((l) => attachDisplayName(l.contact));
    return leases;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateLeaseDto,
    caller?: RegionScope,
  ): Promise<Lease> {
    await this.assertContactInCompany(dto.contactId, companyId, caller);
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const lease = await manager.findOne(Lease, {
        where: { id, companyId, ...regionWhere },
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
        await this.assertNoOtherActiveLease(
          manager,
          lease.unitId,
          companyId,
          id,
        );
        await this.saveActiveLease(manager, lease);
      } else {
        await manager.save(Lease, lease);
      }

      return this.reloadWithContact(manager, id, companyId);
    });
  }

  async renew(
    id: string,
    companyId: string,
    dto: CreateLeaseDto,
    caller?: RegionScope,
  ): Promise<{ oldLease: Lease; newLease: Lease }> {
    await this.assertContactInCompany(dto.contactId, companyId, caller);
    await this.assertUnitInCallerRegions(dto.unitId, companyId, caller);
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const oldLease = await manager.findOne(Lease, {
        where: { id, companyId, ...regionWhere },
        lock: { mode: 'pessimistic_write' },
      });
      if (!oldLease) {
        throw new NotFoundException('Lease not found');
      }
      if (
        oldLease.status !== LeaseStatus.ACTIVE &&
        oldLease.status !== LeaseStatus.EXPIRED
      ) {
        throw new BadRequestException(
          'Only ACTIVE or EXPIRED leases can be renewed',
        );
      }

      oldLease.status = LeaseStatus.RENEWED;
      const savedOldLease = await manager.save(Lease, oldLease);

      const newLease = manager.create(Lease, { ...dto, companyId });
      let savedNewLease: Lease;
      if (newLease.status === LeaseStatus.ACTIVE) {
        await this.assertNoOtherActiveLease(
          manager,
          newLease.unitId,
          companyId,
          id,
        );
        savedNewLease = await this.saveActiveLease(manager, newLease);
      } else {
        savedNewLease = await manager.save(Lease, newLease);
      }

      return {
        oldLease: await this.reloadWithContact(
          manager,
          savedOldLease.id,
          companyId,
        ),
        newLease: await this.reloadWithContact(
          manager,
          savedNewLease.id,
          companyId,
        ),
      };
    });
  }

  async terminate(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<Lease> {
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const lease = await manager.findOne(Lease, {
        where: { id, companyId, ...regionWhere },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lease) {
        throw new NotFoundException('Lease not found');
      }
      if (lease.status !== LeaseStatus.ACTIVE) {
        throw new BadRequestException('Only ACTIVE leases can be terminated');
      }
      lease.status = LeaseStatus.TERMINATED;
      await manager.save(Lease, lease);
      return this.reloadWithContact(manager, id, companyId);
    });
  }

  async remove(
    id: string,
    companyId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const lease = await this.findOne(id, companyId, caller);
    await this.leaseRepository.remove(lease);
  }
}
