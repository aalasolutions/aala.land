import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PropertyDocument,
  DocumentCategory,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { resolveRegionCode } from '../../shared/utils/resolve-region-code.util';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MediaService } from '../properties/media.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Role } from '@shared/enums/roles.enum';
import { seesAllRegions } from '@shared/utils/region-visibility.util';

// Client-facing shape: the internal storage pointers (url, s3Key) are never
// serialized to the client. Documents are served only through the streaming
// download endpoint, so these fields have no use outside the service and would
// only leak the private bucket's path structure.
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
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly mediaService: MediaService,
  ) {}

  async uploadAndCreate(
    companyId: string,
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ): Promise<SanitizedDocument> {
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
      regionCode: await resolveRegionCode(
        this.companyRepository,
        companyId,
        dto.regionCode,
      ),
      uploadedBy: userId,
      version: 1,
    });
    return this.sanitize(await this.documentRepository.save(doc));
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
  ): Promise<{
    data: SanitizedDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const allowedLevels = this.getAllowedAccessLevels(userRole);

    const qb = this.documentRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.unit', 'unit')
      .leftJoinAndSelect('unit.asset', 'asset')
      .leftJoinAndSelect('asset.locality', 'locality')
      .where('doc.company_id = :companyId', { companyId })
      .andWhere('doc.access_level IN (:...allowedLevels)', { allowedLevels });

    // Owner ruling: admins see every region and read regionCode off each row;
    // everyone else is confined to the region they are currently working in.
    if (filters?.regionCode && !seesAllRegions(userRole)) {
      qb.andWhere('doc.region_code = :regionCode', {
        regionCode: filters.regionCode,
      });
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

    // Separate lookup instead of a JOIN — simpler, and page size bounds the cost.
    const uploaderIds = [
      ...new Set(
        data
          .map((d) => d.uploadedBy)
          .filter((id): id is string => id !== null),
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

  // Client-facing single fetch — strips the storage pointers.
  async findOne(
    id: string,
    companyId: string,
    userRole: string,
  ): Promise<SanitizedDocument> {
    return this.sanitize(await this.findOneEntity(id, companyId, userRole));
  }

  // Internal full-entity fetch (keeps url/s3Key) for callers that touch storage:
  // update (save), remove (delete object), downloadStream (read object),
  // getVersionHistory (walk the chain). Never returned to the client directly.
  private async findOneEntity(
    id: string,
    companyId: string,
    userRole: string,
  ): Promise<PropertyDocument> {
    const allowedLevels = this.getAllowedAccessLevels(userRole);

    const doc = await this.documentRepository
      .createQueryBuilder('doc')
      .where('doc.id = :id', { id })
      .andWhere('doc.company_id = :companyId', { companyId })
      .andWhere('doc.access_level IN (:...allowedLevels)', { allowedLevels })
      .getOne();

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
  ): Promise<SanitizedDocument> {
    const existing = await this.findOneEntity(id, companyId, userRole);
    Object.assign(existing, dto);
    return this.sanitize(await this.documentRepository.save(existing));
  }

  async remove(id: string, companyId: string, userRole: string): Promise<void> {
    const doc = await this.findOneEntity(id, companyId, userRole);

    if (doc.s3Key) {
      await this.mediaService.deleteDocumentFromStorage(
        doc.s3Key,
        companyId,
        doc.fileSize,
      );
    }

    await this.documentRepository.remove(doc);
  }

  async downloadStream(
    id: string,
    companyId: string,
    userRole: string,
  ): Promise<{ stream: NodeJS.ReadableStream; doc: PropertyDocument }> {
    const doc = await this.findOneEntity(id, companyId, userRole); // re-checks accessLevel
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
  ): Promise<SanitizedDocument[]> {
    const doc = await this.findOneEntity(id, companyId, userRole);
    const versions: PropertyDocument[] = [doc];

    let current = doc;
    while (current.previousVersionId) {
      const prev = await this.documentRepository.findOne({
        where: { id: current.previousVersionId, companyId },
      });
      if (!prev) break;
      versions.push(prev);
      current = prev;
    }

    return versions.map((v) => this.sanitize(v));
  }

  // Strips the private storage pointers (url, s3Key) from a document before it
  // is returned to the client. Mirrors the omit-by-rest pattern used elsewhere
  // (e.g. companies.controller adminEmail).
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
