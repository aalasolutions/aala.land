import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  attachDisplayName,
  contactDisplayName,
} from '../../shared/utils/contact.util';
import { ContactsService } from '../contacts/contacts.service';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Lease, LeaseStatus, LeaseType } from './entities/lease.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeaseReasonDto, OptionalLeaseReasonDto } from './dto/lease-reason.dto';
import { LeaseArchivedFilter } from './dto/lease-archived-filter.enum';
import { Unit } from '../properties/entities/unit.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
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
  archived?: LeaseArchivedFilter;
}

const ARCHIVED_LEASE_MESSAGE = 'This lease is archived. Unarchive it first.';
const ARCHIVED_UNIT_MESSAGE =
  'This unit is archived and no longer active. Select another unit.';
const ARCHIVED_UNIT_LOCKED_MESSAGE =
  'This unit is archived. Its leases can no longer be edited.';

// Partial unique index name; makes a second ACTIVE lease on one unit impossible at the DB level.
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
    private readonly recordHistoryService: RecordHistoryService,
  ) {}

  // Re-checks under the row lock: READ COMMITTED lets two renews both pass a stale check.
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

  // Catches the unique-index violation from two renews on the same unit; maps it to 400, not 500.
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

  // contactId must belong to lease's company and caller's regions, else it surfaces another's PII.
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

  // Lease's region is its unit's; a unit the caller can't read must not be boundable or listed.
  private async assertUnitInCallerRegions(
    unitId: string | null | undefined,
    companyId: string,
    caller?: RegionScope,
    rejectArchived = false,
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
      select: { id: true, deletedAt: true },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    if (rejectArchived && unit.deletedAt) {
      throw new ConflictException(
        'This unit is archived. Unarchive it before adding a lease.',
      );
    }
  }

  // FOR SHARE so archiveUnit (FOR UPDATE on the unit) cannot commit in between.
  private async assertUnitNotArchivedLocked(
    manager: EntityManager,
    unitId: string,
    companyId: string,
    message: string,
  ): Promise<void> {
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
    await this.assertUnitInCallerRegions(dto.unitId, companyId, caller, true);
    const lease = this.leaseRepository.create({ ...dto, companyId });
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.assertUnitNotArchivedLocked(
        manager,
        dto.unitId,
        companyId,
        'This unit is archived. Unarchive it before adding a lease.',
      );
      return manager.save(Lease, lease);
    });
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
    const archived = filters?.archived ?? LeaseArchivedFilter.EXCLUDE;
    if (archived === LeaseArchivedFilter.EXCLUDE) {
      qb.andWhere('l.deletedAt IS NULL');
    } else if (archived === LeaseArchivedFilter.ONLY) {
      qb.andWhere('l.deletedAt IS NOT NULL');
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
        `(tenant.firstName ILIKE :s OR tenant.lastName ILIKE :s OR unit.unitNumber ILIKE :s OR l.tenancyRegistrationRef ILIKE :s)`,
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
    archived: LeaseArchivedFilter = LeaseArchivedFilter.INCLUDE,
  ): Promise<Lease[]> {
    await this.assertUnitInCallerRegions(unitId, companyId, caller);
    const where: FindOptionsWhere<Lease> = { unitId, companyId };
    if (archived === LeaseArchivedFilter.EXCLUDE) {
      where.deletedAt = IsNull();
    } else if (archived === LeaseArchivedFilter.ONLY) {
      where.deletedAt = Not(IsNull());
    }
    const leases = await this.leaseRepository.find({
      where,
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
    actorId: string,
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
      if (lease.deletedAt) {
        throw new ConflictException(ARCHIVED_LEASE_MESSAGE);
      }

      if (dto.unitId !== undefined && dto.unitId !== lease.unitId) {
        if (lease.status !== LeaseStatus.DRAFT) {
          throw new BadRequestException(
            'Only a draft lease can move to another unit.',
          );
        }
        await this.assertUnitInCallerRegions(
          dto.unitId,
          companyId,
          caller,
          true,
        );
        await this.assertUnitNotArchivedLocked(
          manager,
          dto.unitId,
          companyId,
          ARCHIVED_UNIT_MESSAGE,
        );
      } else {
        await this.assertUnitNotArchivedLocked(
          manager,
          lease.unitId,
          companyId,
          lease.status === LeaseStatus.DRAFT
            ? ARCHIVED_UNIT_MESSAGE
            : ARCHIVED_UNIT_LOCKED_MESSAGE,
        );
      }

      if (dto.status && dto.status !== lease.status) {
        const terminal = [LeaseStatus.TERMINATED, LeaseStatus.RENEWED];
        if (terminal.includes(lease.status)) {
          throw new BadRequestException(
            `Cannot change status of a ${lease.status} lease`,
          );
        }
        if (dto.status === LeaseStatus.DRAFT) {
          throw new ConflictException(
            `A ${lease.status} lease cannot move back to DRAFT`,
          );
        }
      }

      const fromStatus = lease.status;
      Object.assign(lease, dto);

      // Re-check under the row lock so two DRAFT->ACTIVE flips on the same unit cannot both land.
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

      if (lease.status !== fromStatus) {
        await this.recordLeaseHistory(
          manager,
          lease,
          RecordHistoryAction.STATUS_CHANGE,
          actorId,
          null,
          { from: fromStatus, to: lease.status },
        );
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
    await this.assertUnitInCallerRegions(dto.unitId, companyId, caller, true);
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const oldLease = await manager.findOne(Lease, {
        where: { id, companyId, ...regionWhere },
        lock: { mode: 'pessimistic_write' },
      });
      if (!oldLease) {
        throw new NotFoundException('Lease not found');
      }
      if (oldLease.deletedAt) {
        throw new ConflictException(ARCHIVED_LEASE_MESSAGE);
      }
      if (
        oldLease.status !== LeaseStatus.ACTIVE &&
        oldLease.status !== LeaseStatus.EXPIRED
      ) {
        throw new BadRequestException(
          'Only ACTIVE or EXPIRED leases can be renewed',
        );
      }

      // Lease row, then the new unit FOR SHARE.
      await this.assertUnitNotArchivedLocked(
        manager,
        dto.unitId,
        companyId,
        'This unit is archived. Unarchive it before adding a lease.',
      );

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
    dto: LeaseReasonDto,
    actorId: string,
    caller?: RegionScope,
  ): Promise<Lease> {
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, id, companyId, regionWhere);
      if (lease.deletedAt) {
        throw new ConflictException(ARCHIVED_LEASE_MESSAGE);
      }
      if (lease.status !== LeaseStatus.ACTIVE) {
        throw new BadRequestException('Only ACTIVE leases can be terminated');
      }
      lease.status = LeaseStatus.TERMINATED;
      await manager.save(Lease, lease);
      await this.recordLeaseHistory(
        manager,
        lease,
        RecordHistoryAction.TERMINATE,
        actorId,
        dto.reason,
      );
      return this.reloadWithContact(manager, id, companyId);
    });
  }

  async remove(
    id: string,
    companyId: string,
    dto: LeaseReasonDto,
    actorId: string,
    caller?: RegionScope,
  ): Promise<void> {
    const regionWhere = this.regionScopedWhere(caller);
    await this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, id, companyId, regionWhere);
      if (lease.status !== LeaseStatus.DRAFT) {
        throw new ConflictException(
          'Only draft leases can be deleted. Archive it instead.',
        );
      }
      const chequeCount = await manager.count(Cheque, {
        where: { leaseId: id, companyId },
      });
      if (chequeCount > 0) {
        throw new ConflictException(
          `This lease has ${chequeCount} linked cheque(s). Remove them before deleting the lease.`,
        );
      }
      await this.recordLeaseHistory(
        manager,
        lease,
        RecordHistoryAction.DELETE,
        actorId,
        dto.reason,
        { status: lease.status },
      );
      await manager.remove(Lease, lease);
    });
  }

  async archive(
    id: string,
    companyId: string,
    dto: LeaseReasonDto,
    actorId: string,
    caller?: RegionScope,
  ): Promise<Lease> {
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, id, companyId, regionWhere);
      if (lease.deletedAt) {
        throw new ConflictException('This lease is already archived');
      }
      if (lease.status === LeaseStatus.ACTIVE) {
        throw new ConflictException(
          'Active leases cannot be archived. Terminate it first.',
        );
      }
      lease.deletedAt = new Date();
      await manager.save(Lease, lease);
      await this.recordLeaseHistory(
        manager,
        lease,
        RecordHistoryAction.ARCHIVE,
        actorId,
        dto.reason,
        { status: lease.status },
      );
      return this.reloadWithContact(manager, id, companyId);
    });
  }

  async unarchive(
    id: string,
    companyId: string,
    dto: OptionalLeaseReasonDto,
    actorId: string,
    caller?: RegionScope,
  ): Promise<Lease> {
    const regionWhere = this.regionScopedWhere(caller);
    return this.dataSource.transaction(async (manager) => {
      const lease = await this.lockLease(manager, id, companyId, regionWhere);
      if (!lease.deletedAt) {
        throw new ConflictException('This lease is not archived');
      }
      lease.deletedAt = null;
      await manager.save(Lease, lease);
      await this.recordLeaseHistory(
        manager,
        lease,
        RecordHistoryAction.UNARCHIVE,
        actorId,
        dto.reason,
        { status: lease.status },
      );
      return this.reloadWithContact(manager, id, companyId);
    });
  }

  private async lockLease(
    manager: EntityManager,
    id: string,
    companyId: string,
    regionWhere: FindOptionsWhere<Lease>,
  ): Promise<Lease> {
    const lease = await manager.findOne(Lease, {
      where: { id, companyId, ...regionWhere },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  // Snapshot unit, tenant and region for the history row.
  private async recordLeaseHistory(
    manager: EntityManager,
    lease: Lease,
    action: RecordHistoryAction,
    actorId: string,
    reason?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const unit = await manager.findOne(Unit, {
      where: { id: lease.unitId, companyId: lease.companyId },
      relations: { asset: { locality: { city: true } } },
    });
    const contact = lease.contactId
      ? await manager.findOne(Contact, {
          where: { id: lease.contactId, companyId: lease.companyId },
        })
      : null;
    const actorName = await this.recordHistoryService.resolveActorName(
      manager,
      actorId,
    );

    let entityTitle = unit?.unitNumber ? `Lease ${unit.unitNumber}` : 'Lease';
    if (lease.tenancyRegistrationRef) {
      entityTitle += ` (Tenancy Registration ${lease.tenancyRegistrationRef})`;
    }

    await this.recordHistoryService.record(manager, {
      companyId: lease.companyId,
      action,
      entityType: 'Lease',
      entityId: lease.id,
      entityTitle,
      contextTitle: contactDisplayName(contact),
      reason: reason ?? null,
      actorId,
      actorName,
      regionCode: unit?.asset?.locality?.city?.regionCode ?? undefined,
      metadata: metadata ?? null,
    });
  }
}
