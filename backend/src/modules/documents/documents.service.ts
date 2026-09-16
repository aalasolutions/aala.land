import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

// Storage pointers stripped before reaching client; documents serve only via streaming download.
export type SanitizedDocument = Omit<
  PropertyDocument,
  'url' | 's3Key' | 'unit'
> & {
  uploadedByName?: string | null;
  unit?: {
    id: string;
    unitNumber: string;
    areaId: string | null;
    assetName: string | null;
  } | null;
};

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
    if (dto.unitId) {
      await this.assertUnitNotArchived(companyId, dto.unitId, 'uploading');
    }
    const regionCode = await this.resolveDocumentRegion(companyId, dto, caller);
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
    filters?: {
      search?: string;
      accessLevel?: DocumentAccessLevel;
      dateFrom?: string;
      dateTo?: string;
      regionCode?: string;
    },
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

    if (unitId) {
      qb.andWhere('doc.unit_id = :unitId', { unitId });
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
      qb.andWhere("doc.created_at < :dateTo::date + interval '1 day'", {
        dateTo: filters.dateTo,
      });
    }

    qb.skip((page - 1) * limit)
      .take(limit)
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
        Object.assign(existing, dto);
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

  // NULL is company-wide, admin-only; property-attached takes that property's region.
  private async resolveDocumentRegion(
    companyId: string,
    dto: UploadDocumentDto,
    caller: RegionScope,
  ): Promise<string | null> {
    if (dto.regionCode) {
      return resolveRegionCode(
        this.companyRepository,
        companyId,
        dto.regionCode,
        caller,
      );
    }

    const attachedRegion = await this.regionOfProperty(
      companyId,
      dto.unitId,
      dto.assetId,
    );
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

  // Mirrors the omit-by-rest sanitize pattern used elsewhere (companies.controller adminEmail).
  private sanitize(doc: PropertyDocument): SanitizedDocument {
    const { url: _url, s3Key: _s3Key, unit: _unit, ...rest } = doc;
    return rest;
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
