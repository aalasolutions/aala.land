import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PropertyDocument,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { MediaService } from '../properties/media.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Role } from '@shared/enums/roles.enum';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(PropertyDocument)
    private readonly documentRepository: Repository<PropertyDocument>,
    private readonly mediaService: MediaService,
  ) {}

  async uploadAndCreate(
    companyId: string,
    userId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
  ): Promise<PropertyDocument> {
    const { url, s3Key, fileSize } =
      await this.mediaService.uploadDocumentToStorage(companyId, file);

    const doc = this.documentRepository.create({
      name: dto.name,
      url,
      s3Key,
      fileSize,
      fileType: dto.fileType ?? file.mimetype,
      unitId: dto.unitId ?? null,
      assetId: dto.assetId ?? null, // persists to building_id column (legacy naming)
      category: dto.category,
      accessLevel: dto.accessLevel,
      companyId,
      uploadedBy: userId,
      version: 1,
    });
    return this.documentRepository.save(doc);
  }

  async findAll(
    companyId: string,
    userRole: string,
    page = 1,
    limit = 20,
    category?: string,
  ): Promise<{
    data: PropertyDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const allowedLevels = this.getAllowedAccessLevels(userRole);

    const qb = this.documentRepository
      .createQueryBuilder('doc')
      .where('doc.company_id = :companyId', { companyId })
      .andWhere('doc.access_level IN (:...allowedLevels)', { allowedLevels });

    if (category) {
      qb.andWhere('doc.category = :category', { category });
    }

    qb.skip((page - 1) * limit)
      .take(limit)
      .orderBy('doc.created_at', 'DESC');

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(
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
  ): Promise<PropertyDocument> {
    const existing = await this.findOne(id, companyId, userRole);
    Object.assign(existing, dto);
    return this.documentRepository.save(existing);
  }

  async remove(id: string, companyId: string, userRole: string): Promise<void> {
    const doc = await this.findOne(id, companyId, userRole);

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
    const doc = await this.findOne(id, companyId, userRole); // re-checks accessLevel
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
  ): Promise<PropertyDocument[]> {
    const doc = await this.findOne(id, companyId, userRole);
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

    return versions;
  }

  private getAllowedAccessLevels(userRole: string): DocumentAccessLevel[] {
    switch (userRole) {
      case Role.SUPER_ADMIN:
        return [
          DocumentAccessLevel.PUBLIC,
          DocumentAccessLevel.COMPANY,
          DocumentAccessLevel.OWNER_ONLY,
          DocumentAccessLevel.ADMIN_ONLY,
        ];
      case Role.COMPANY_ADMIN:
      case Role.ADMIN:
        return [
          DocumentAccessLevel.PUBLIC,
          DocumentAccessLevel.COMPANY,
          DocumentAccessLevel.ADMIN_ONLY,
        ];
      case Role.AGENT:
        return [DocumentAccessLevel.PUBLIC, DocumentAccessLevel.COMPANY];
      case Role.ACCOUNTANT:
        return [DocumentAccessLevel.PUBLIC];
      case Role.MANAGER:
        return [DocumentAccessLevel.PUBLIC, DocumentAccessLevel.COMPANY];
      default:
        return [DocumentAccessLevel.PUBLIC];
    }
  }
}
