import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { clampLimit, pageSkip } from '@shared/utils/pagination.util';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  PropertyDocument,
  DocumentCategory,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Asset } from '../properties/entities/asset.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Lease } from '../leases/entities/lease.entity';
import { WorkOrder } from '../maintenance/entities/work-order.entity';
import {
  RegionScope,
  resolveRegionCode,
} from '../../shared/utils/resolve-region-code.util';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MediaService } from '../properties/media.service';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Role } from '@shared/enums/roles.enum';
import {
  effectiveRegionCodes,
  isAdminRole,
  scopedRegionCodes,
} from '@shared/utils/region-visibility.util';
import { isDateOnly } from '../../shared/utils/region-time.util';
import {
  DOCUMENT_LINK_COLUMNS,
  DocumentLink,
  DocumentRelatedFilter,
  documentLink,
} from './document-link';

// Storage pointers and joined parents never reach the client; files serve only via download.
const CLIENT_HIDDEN_KEYS = [
  'url',
  's3Key',
  'unit',
  'asset',
  'contact',
  'lease',
  'workOrder',
] as const;

export type SanitizedDocument = Omit<
  PropertyDocument,
  (typeof CLIENT_HIDDEN_KEYS)[number]
> & {
  uploadedByName?: string | null;
  unit?: {
    id: string;
    unitNumber: string;
    areaId: string | null;
    assetName: string | null;
  } | null;
  link?: DocumentLink | null;
  derivedFrom?: 'lease' | 'work_order';
};

export interface DocumentListFilters {
  search?: string;
  accessLevel?: DocumentAccessLevel;
  dateFrom?: string;
  dateTo?: string;
  regionCode?: string;
  contactId?: string;
  leaseId?: string;
  workOrderId?: string;
  related?: DocumentRelatedFilter;
  includeDerived?: boolean;
}

const LINK_ID_KEYS = [
  'unitId',
  'assetId',
  'contactId',
  'leaseId',
  'workOrderId',
] as const;

type LinkIdKey = (typeof LINK_ID_KEYS)[number];
type DocumentLinkIds = Partial<Record<LinkIdKey, string | null>>;

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(PropertyDocument)
    private readonly documentRepository: Repository<PropertyDocument>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Lease)
    private readonly leaseRepository: Repository<Lease>,
    @InjectRepository(WorkOrder)
    private readonly workOrderRepository: Repository<WorkOrder>,
    private readonly mediaService: MediaService,
    private readonly dataSource: DataSource,
    private readonly storagePurge: StoragePurgeService,
  ) {}

  async uploadAndCreate(
    companyId: string,
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    caller: RegionScope,
  ): Promise<SanitizedDocument> {
    // Checked before the storage write so a refusal leaves no object behind.
    this.assertAccessLevelAllowed(caller.role, dto.accessLevel);
    const attachedRegion = await this.validateLink(
      companyId,
      caller,
      dto,
      'uploading',
    );
    const regionCode = await this.resolveDocumentRegion(
      companyId,
      dto.regionCode,
      attachedRegion,
      caller,
    );
    const { url, s3Key, fileSize } =
      await this.mediaService.uploadDocumentToStorage(companyId, file);

    const doc = this.documentRepository.create({
      name: dto.name,
      url,
      s3Key,
      fileSize,
      fileType: dto.fileType ?? file.mimetype,
      unitId: dto.unitId ?? null,
      assetId: dto.assetId ?? null,
      contactId: dto.contactId ?? null,
      leaseId: dto.leaseId ?? null,
      workOrderId: dto.workOrderId ?? null,
      category: dto.category,
      accessLevel: dto.accessLevel,
      companyId,
      regionCode,
      uploadedBy: userId,
      version: 1,
    });
    return this.sanitize(
      await this.dataSource.transaction(async (manager) => {
        if (dto.unitId) {
          await this.assertUnitNotArchived(
            companyId,
            dto.unitId,
            'uploading',
            manager,
          );
        }
        return manager.getRepository(PropertyDocument).save(doc);
      }),
    );
  }

  async findAll(
    companyId: string,
    userRole: string,
    page = 1,
    limit = 20,
    category?: DocumentCategory,
    unitId?: string,
    filters?: DocumentListFilters,
    regionCodes?: string[],
  ): Promise<{
    data: SanitizedDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const allowedLevels = this.getAllowedAccessLevels(userRole);
    const scopedCodes = effectiveRegionCodes(filters?.regionCode, {
      role: userRole,
      regionCodes: regionCodes ?? [],
    });

    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const qb = this.documentRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.unit', 'unit')
      .leftJoinAndSelect('unit.asset', 'asset')
      .leftJoinAndSelect('asset.locality', 'locality')
      .leftJoin('doc.asset', 'docAsset')
      .addSelect(['docAsset.id', 'docAsset.name'])
      .leftJoin('doc.contact', 'contact', 'contact.company_id = doc.company_id')
      .addSelect([
        'contact.id',
        'contact.firstName',
        'contact.lastName',
        'contact.phone',
      ])
      .leftJoin('doc.lease', 'lease', 'lease.company_id = doc.company_id')
      .addSelect(['lease.id', 'lease.startDate'])
      .leftJoin(
        'lease.contact',
        'leaseContact',
        'leaseContact.company_id = lease.company_id',
      )
      .addSelect([
        'leaseContact.id',
        'leaseContact.firstName',
        'leaseContact.lastName',
        'leaseContact.phone',
      ])
      .leftJoin(
        'doc.workOrder',
        'workOrder',
        'workOrder.company_id = doc.company_id',
      )
      .addSelect(['workOrder.id', 'workOrder.title'])
      .where('doc.company_id = :companyId', { companyId })
      .andWhere('doc.access_level IN (:...allowedLevels)', { allowedLevels });

    if (scopedCodes) {
      qb.andWhere(
        '(doc.region_code IN (:...scopedCodes) OR doc.region_code IS NULL)',
        { scopedCodes },
      );
    }

    if (category) {
      qb.andWhere('doc.category = :category', { category });
    }

    const includeDerived = Boolean(unitId && filters?.includeDerived);
    if (unitId && includeDerived) {
      // Leases and work orders on the unit surface their documents on the unit page.
      qb.andWhere(
        '(doc.unit_id = :unitId' +
          ' OR doc.lease_id IN (SELECT dl.id FROM leases dl WHERE dl.unit_id = :unitId AND dl.company_id = :companyId)' +
          ' OR doc.work_order_id IN (SELECT dw.id FROM work_orders dw WHERE dw.unit_id = :unitId AND dw.company_id = :companyId))',
        { unitId },
      );
    } else if (unitId) {
      qb.andWhere('doc.unit_id = :unitId', { unitId });
    }

    if (filters?.contactId) {
      qb.andWhere('doc.contact_id = :contactId', {
        contactId: filters.contactId,
      });
    }

    if (filters?.leaseId) {
      qb.andWhere('doc.lease_id = :leaseId', { leaseId: filters.leaseId });
    }

    if (filters?.workOrderId) {
      qb.andWhere('doc.work_order_id = :workOrderId', {
        workOrderId: filters.workOrderId,
      });
    }

    if (filters?.related === 'none') {
      qb.andWhere(
        `(${Object.values(DOCUMENT_LINK_COLUMNS)
          .map((column) => `doc.${column} IS NULL`)
          .join(' AND ')})`,
      );
    } else if (filters?.related) {
      qb.andWhere(`doc.${DOCUMENT_LINK_COLUMNS[filters.related]} IS NOT NULL`);
    }

    if (filters?.accessLevel) {
      qb.andWhere('doc.access_level = :accessLevel', {
        accessLevel: filters.accessLevel,
      });
    }

    if (filters?.search) {
      qb.andWhere('doc.name ILIKE :search', { search: `%${filters.search}%` });
    }

    if (filters?.dateFrom) {
      qb.andWhere('doc.created_at >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters?.dateTo) {
      // Browsers send the next local midnight as an instant; a bare date is a UTC day.
      const upper = isDateOnly(filters.dateTo)
        ? ":dateTo::date + interval '1 day'"
        : ':dateTo::timestamptz';
      qb.andWhere(`doc.created_at < ${upper}`, {
        dateTo: filters.dateTo,
      });
    }

    qb.skip(pageSkip(page, limit))
      .take(clampLimit(limit))
      .orderBy('doc.createdAt', 'DESC');

    const [data, total] = await qb.getManyAndCount();

    // Separate lookup instead of a JOIN: simpler, and page size bounds the cost.
    const uploaderIds = [
      ...new Set(
        data.map((d) => d.uploadedBy).filter((id): id is string => id !== null),
      ),
    ];
    const uploaderNames = uploaderIds.length
      ? new Map(
          (
            await this.userRepository.find({
              where: { id: In(uploaderIds), companyId },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name]),
        )
      : new Map<string, string>();

    return {
      data: data.map((d) => ({
        ...this.sanitize(d),
        link: documentLink(d),
        ...this.derivedFrom(d, includeDerived ? unitId : undefined),
        uploadedByName: d.uploadedBy
          ? (uploaderNames.get(d.uploadedBy) ?? null)
          : null,
        unit: d.unit
          ? {
              id: d.unit.id,
              unitNumber: d.unit.unitNumber,
              areaId: d.unit.asset?.locality?.id ?? null,
              assetName: d.unit.asset?.name ?? null,
            }
          : null,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: string,
    companyId: string,
    userRole: string,
    regionCodes: string[],
  ): Promise<SanitizedDocument> {
    return this.sanitize(
      await this.findOneEntity(id, companyId, userRole, regionCodes),
    );
  }

  // Internal fetch keeps url/s3Key for storage-facing callers; never returned to client.
  private async findOneEntity(
    id: string,
    companyId: string,
    userRole: string,
    regionCodes: string[],
  ): Promise<PropertyDocument> {
    const allowedLevels = this.getAllowedAccessLevels(userRole);
    const scopedCodes = scopedRegionCodes({ role: userRole, regionCodes });

    // No assignment means no access, and an empty IN () is invalid SQL.
    if (scopedCodes?.length === 0) {
      throw new NotFoundException('Document not found');
    }

    const qb = this.documentRepository
      .createQueryBuilder('doc')
      .where('doc.id = :id', { id })
      .andWhere('doc.company_id = :companyId', { companyId })
      .andWhere('doc.access_level IN (:...allowedLevels)', { allowedLevels });

    if (scopedCodes) {
      qb.andWhere(
        '(doc.region_code IN (:...scopedCodes) OR doc.region_code IS NULL)',
        { scopedCodes },
      );
    }

    const doc = await qb.getOne();

    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  async update(
    id: string,
    companyId: string,
    userRole: string,
    dto: UpdateDocumentDto,
    regionCodes: string[],
  ): Promise<SanitizedDocument> {
    const existing = await this.findOneEntity(
      id,
      companyId,
      userRole,
      regionCodes,
    );
    const caller: RegionScope = { role: userRole, regionCodes };
    this.assertAccessLevelAllowed(userRole, dto.accessLevel);

    const { unitId, assetId, contactId, leaseId, workOrderId, ...metadata } =
      dto;
    const requested: DocumentLinkIds = {
      unitId,
      assetId,
      contactId,
      leaseId,
      workOrderId,
    };
    // Omitted keeps the current link column, null clears it, a uuid sets it.
    const nextLink = {} as Record<LinkIdKey, string | null>;
    for (const key of LINK_ID_KEYS) {
      const value = requested[key];
      nextLink[key] = value === undefined ? existing[key] : value;
    }
    const linkChanged = LINK_ID_KEYS.some(
      (key) => nextLink[key] !== existing[key],
    );

    let regionCode = existing.regionCode;
    if (linkChanged) {
      const attachedRegion = await this.validateLink(
        companyId,
        caller,
        nextLink,
        'editing',
      );
      if (attachedRegion) {
        regionCode = await this.resolveDocumentRegion(
          companyId,
          undefined,
          attachedRegion,
          caller,
        );
      }
    }

    return this.sanitize(
      await this.dataSource.transaction(async (manager) => {
        if (existing.unitId) {
          await this.assertUnitNotArchived(
            companyId,
            existing.unitId,
            'editing',
            manager,
          );
        }
        if (nextLink.unitId && nextLink.unitId !== existing.unitId) {
          await this.assertUnitNotArchived(
            companyId,
            nextLink.unitId,
            'editing',
            manager,
          );
        }
        Object.assign(existing, metadata, nextLink, { regionCode });
        return manager.getRepository(PropertyDocument).save(existing);
      }),
    );
  }

  async remove(
    id: string,
    companyId: string,
    userRole: string,
    regionCodes: string[],
  ): Promise<void> {
    const doc = await this.findOneEntity(id, companyId, userRole, regionCodes);

    const purgeIds = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(PropertyDocument, {
        where: { id: doc.id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Document not found');
      return this.storagePurge.purge(manager, { documents: [locked] });
    });
    void this.storagePurge.dispatch(purgeIds);
  }

  async downloadStream(
    id: string,
    companyId: string,
    userRole: string,
    regionCodes: string[],
  ): Promise<{ stream: NodeJS.ReadableStream; doc: PropertyDocument }> {
    const doc = await this.findOneEntity(id, companyId, userRole, regionCodes);
    if (!doc.s3Key) {
      throw new NotFoundException('Document has no associated file in storage');
    }
    const stream = await this.mediaService.getDocumentStream(doc.s3Key);
    return { stream, doc };
  }

  async getVersionHistory(
    id: string,
    companyId: string,
    userRole: string,
    regionCodes: string[],
  ): Promise<SanitizedDocument[]> {
    const doc = await this.findOneEntity(id, companyId, userRole, regionCodes);
    const scopedCodes = scopedRegionCodes({ role: userRole, regionCodes });
    const versions: PropertyDocument[] = [doc];

    let current = doc;
    while (current.previousVersionId) {
      const prev = await this.documentRepository.findOne({
        where: scopedCodes
          ? [
              {
                id: current.previousVersionId,
                companyId,
                regionCode: In(scopedCodes),
              },
              {
                id: current.previousVersionId,
                companyId,
                regionCode: IsNull(),
              },
            ]
          : { id: current.previousVersionId, companyId },
      });
      if (!prev) break;
      versions.push(prev);
      current = prev;
    }

    return versions.map((v) => this.sanitize(v));
  }

  // NULL is company-wide, admin-only; a linked document inherits its parent's region.
  private async resolveDocumentRegion(
    companyId: string,
    requestedRegion: string | undefined,
    attachedRegion: string | undefined,
    caller: RegionScope,
  ): Promise<string | null> {
    if (requestedRegion) {
      return resolveRegionCode(
        this.companyRepository,
        companyId,
        requestedRegion,
        caller,
      );
    }

    if (attachedRegion) {
      return attachedRegion;
    }

    if (isAdminRole(caller.role)) {
      return null;
    }

    const ownRegion = (caller.regionCodes ?? [])[0];
    if (!ownRegion) {
      throw new BadRequestException('No region assigned to you');
    }
    return ownRegion;
  }

  // One link at most; returns the linked parent's region so the document can inherit it.
  private async validateLink(
    companyId: string,
    caller: RegionScope,
    link: DocumentLinkIds,
    verb: 'uploading' | 'editing',
  ): Promise<string | undefined> {
    if (LINK_ID_KEYS.filter((key) => link[key]).length > 1) {
      throw new BadRequestException('A document can link to only one record');
    }
    const { unitId, assetId, contactId, leaseId, workOrderId } = link;

    if (unitId) {
      await this.assertUnitNotArchived(companyId, unitId, verb);
      return this.regionOfProperty(companyId, unitId);
    }
    if (assetId) {
      return this.regionOfProperty(companyId, undefined, assetId);
    }
    if (contactId) {
      const contact = await this.contactRepository.findOne({
        where: { id: contactId, companyId },
        select: { id: true, regionCode: true },
      });
      return this.visibleParentRegion(contact, 'contactId', caller);
    }
    if (leaseId) {
      const lease = await this.leaseRepository.findOne({
        where: { id: leaseId, companyId },
        select: { id: true, regionCode: true, deletedAt: true },
      });
      const region = this.visibleParentRegion(lease, 'leaseId', caller);
      if (lease?.deletedAt) {
        throw new ConflictException(
          `This lease is archived. Unarchive it before ${verb} documents.`,
        );
      }
      return region;
    }
    if (workOrderId) {
      const workOrder = await this.workOrderRepository.findOne({
        where: { id: workOrderId, companyId },
        select: { id: true, regionCode: true },
      });
      return this.visibleParentRegion(workOrder, 'workOrderId', caller);
    }
    return undefined;
  }

  // A parent outside the caller's regions reads as missing, so its existence does not leak.
  private visibleParentRegion(
    parent: { regionCode: string } | null,
    field: 'contactId' | 'leaseId' | 'workOrderId',
    caller: RegionScope,
  ): string {
    const scopedCodes = scopedRegionCodes(caller);
    if (
      !parent?.regionCode ||
      (scopedCodes && !scopedCodes.includes(parent.regionCode))
    ) {
      throw new BadRequestException(`Invalid ${field}: record not found`);
    }
    return parent.regionCode;
  }

  // Refuses a level the caller could not read back, which would strand the document.
  private assertAccessLevelAllowed(
    userRole: string,
    accessLevel?: DocumentAccessLevel,
  ): void {
    if (
      accessLevel &&
      !this.getAllowedAccessLevels(userRole).includes(accessLevel)
    ) {
      throw new BadRequestException(
        'You cannot share a document at that level',
      );
    }
  }

  private derivedFrom(
    doc: PropertyDocument,
    unitId?: string,
  ): { derivedFrom?: 'lease' | 'work_order' } {
    if (!unitId || doc.unitId === unitId) return {};
    if (doc.leaseId) return { derivedFrom: 'lease' };
    if (doc.workOrderId) return { derivedFrom: 'work_order' };
    return {};
  }

  private async assertUnitNotArchived(
    companyId: string,
    unitId: string,
    verb: 'uploading' | 'editing',
    manager?: EntityManager,
  ): Promise<void> {
    // With a manager, FOR SHARE so archiveUnit cannot commit in between.
    const unit = manager
      ? await manager.findOne(Unit, {
          where: { id: unitId, companyId },
          select: { id: true, deletedAt: true },
          lock: { mode: 'pessimistic_read' },
        })
      : await this.unitRepository.findOne({
          where: { id: unitId, companyId },
          select: { id: true, deletedAt: true },
        });
    if (!unit) {
      throw new BadRequestException('Invalid property selected');
    }
    if (unit.deletedAt) {
      throw new ConflictException(
        `This unit is archived. Unarchive it before ${verb} documents.`,
      );
    }
  }

  // Document may only attach to a visible property; unresolvable id is rejected, not falls through.
  private async regionOfProperty(
    companyId: string,
    unitId?: string,
    assetId?: string,
  ): Promise<string | undefined> {
    if (unitId) {
      const row = await this.unitRepository
        .createQueryBuilder('u')
        .innerJoin('u.asset', 'a')
        .innerJoin('a.locality', 'loc')
        .innerJoin('loc.city', 'ci')
        .select('ci.regionCode', 'regionCode')
        .where('u.id = :unitId', { unitId })
        .andWhere('u.companyId = :companyId', { companyId })
        .getRawOne<{ regionCode: string }>();
      if (!row?.regionCode) {
        throw new BadRequestException('Invalid property selected');
      }
      return row.regionCode;
    }

    if (assetId) {
      // Asset shared: visible if company created it or owns units inside; matches findAllAssets.
      const row = await this.assetRepository
        .createQueryBuilder('a')
        .innerJoin('a.locality', 'loc')
        .innerJoin('loc.city', 'ci')
        .select('ci.regionCode', 'regionCode')
        .where('a.id = :assetId', { assetId })
        .andWhere(
          '(a.createdByCompanyId = :companyId OR EXISTS (SELECT 1 FROM units u2 WHERE u2.asset_id = a.id AND u2.company_id = :companyId AND u2.deleted_at IS NULL))',
          { companyId },
        )
        .getRawOne<{ regionCode: string }>();
      if (!row?.regionCode) {
        throw new BadRequestException('Invalid property selected');
      }
      return row.regionCode;
    }

    return undefined;
  }

  private sanitize(doc: PropertyDocument): SanitizedDocument {
    const rest: Partial<PropertyDocument> = { ...doc };
    for (const key of CLIENT_HIDDEN_KEYS) {
      delete rest[key];
    }
    return rest as SanitizedDocument;
  }

  private getAllowedAccessLevels(userRole: string): DocumentAccessLevel[] {
    switch (userRole) {
      case Role.SUPER_ADMIN:
      case Role.COMPANY_ADMIN:
      case Role.ADMIN:
        return [DocumentAccessLevel.ADMIN, DocumentAccessLevel.TEAM];
      case Role.AGENT:
      case Role.ACCOUNTANT:
      case Role.MANAGER:
        return [DocumentAccessLevel.TEAM];
      default:
        return [DocumentAccessLevel.TEAM];
    }
  }
}
