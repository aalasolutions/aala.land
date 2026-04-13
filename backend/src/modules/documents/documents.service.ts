import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PropertyDocument, DocumentCategory, DocumentAccessLevel } from '../properties/entities/property-document.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { Role } from '@shared/enums/roles.enum';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(PropertyDocument)
    private readonly documentRepository: Repository<PropertyDocument>,
  ) {}

  async create(companyId: string, userId: string, dto: CreateDocumentDto): Promise<PropertyDocument> {
    const doc = this.documentRepository.create({
      ...dto,
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
    category?: DocumentCategory,
  ): Promise<{ data: PropertyDocument[]; total: number; page: number; limit: number }> {
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

  async findOne(id: string, companyId: string, userRole: string): Promise<PropertyDocument> {
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
    userId: string,
    userRole: string,
    dto: UpdateDocumentDto,
  ): Promise<PropertyDocument> {
    const existing = await this.findOne(id, companyId, userRole);

    // If URL changes, create a new version
    if (dto.url && dto.url !== existing.url) {
      const newVersion = this.documentRepository.create({
        name: dto.name ?? existing.name,
        url: dto.url,
        fileType: dto.fileType ?? existing.fileType,
        category: dto.category ?? existing.category,
        accessLevel: dto.accessLevel ?? existing.accessLevel,
        unitId: existing.unitId,
        assetId: existing.assetId,
        companyId,
        uploadedBy: userId,
        version: existing.version + 1,
        previousVersionId: existing.id,
      });
      return this.documentRepository.save(newVersion);
    }

    // Otherwise just update in place
    Object.assign(existing, dto);
    return this.documentRepository.save(existing);
  }

  async remove(id: string, companyId: string, userRole: string): Promise<void> {
    const doc = await this.findOne(id, companyId, userRole);
    await this.documentRepository.remove(doc);
  }

  async getVersionHistory(id: string, companyId: string, userRole: string): Promise<PropertyDocument[]> {
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
        return [
          DocumentAccessLevel.PUBLIC,
          DocumentAccessLevel.COMPANY,
          DocumentAccessLevel.ADMIN_ONLY,
        ];
      case Role.AGENT:
        return [
          DocumentAccessLevel.PUBLIC,
          DocumentAccessLevel.COMPANY,
        ];
      case Role.VIEWER:
      default:
        return [DocumentAccessLevel.PUBLIC];
    }
  }
}
