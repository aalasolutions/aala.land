import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Cheque, ChequeStatus } from './entities/cheque.entity';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';
import { BounceChequeDto } from './dto/bounce-cheque.dto';
import { REGION_FILTER_SUBQUERY } from '../../shared/utils/region-filter.util';
import { paginationOptions, pageSkip } from '../../shared/utils/pagination.util';

@Injectable()
export class ChequesService {
  private readonly logger = new Logger(ChequesService.name);

  constructor(
    @InjectRepository(Cheque)
    private readonly chequeRepository: Repository<Cheque>,
  ) { }

  async create(companyId: string, dto: CreateChequeDto): Promise<Cheque> {
    const cheque = this.chequeRepository.create({ ...dto, companyId });
    return this.chequeRepository.save(cheque);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    regionCode?: string,
  ): Promise<{ data: Cheque[]; total: number; page: number; limit: number }> {
    if (regionCode) {
      const qb = this.chequeRepository
        .createQueryBuilder('c')
        .where('c.companyId = :companyId', { companyId })
        .andWhere(
          `c.unitId IN (${REGION_FILTER_SUBQUERY})`,
          { regionCode },
        )
        .skip(pageSkip(page, limit))
        .take(limit)
        .orderBy('c.dueDate', 'ASC');

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    const [data, total] = await this.chequeRepository.findAndCount({
      where: { companyId },
      ...paginationOptions(page, limit),
      order: { dueDate: 'ASC' },
    });
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Cheque> {
    const cheque = await this.chequeRepository.findOne({ where: { id, companyId } });
    if (!cheque) {
      throw new NotFoundException('Cheque not found');
    }
    return cheque;
  }

  async update(id: string, companyId: string, dto: UpdateChequeDto): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);
    Object.assign(cheque, dto);
    return this.chequeRepository.save(cheque);
  }

  async processOcr(id: string, companyId: string, imageUrl: string): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);
    cheque.ocrImageUrl = imageUrl;

    try {
      const ocrResult = await this.runOcrExtraction(imageUrl);
      cheque.ocrData = ocrResult;
      cheque.ocrProcessed = true;
      this.logger.log(`OCR processed for cheque ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`OCR failed for cheque ${id}: ${message}`);
      cheque.ocrProcessed = false;
    }

    return this.chequeRepository.save(cheque);
  }

  async bounce(id: string, companyId: string, dto: BounceChequeDto): Promise<Cheque> {
    const cheque = await this.findOne(id, companyId);
    cheque.bounceCount = (cheque.bounceCount || 0) + 1;
    cheque.bounceReason = dto.bounceReason || null;
    cheque.lastBounceDate = new Date();
    cheque.status = ChequeStatus.BOUNCED;
    return this.chequeRepository.save(cheque);
  }

  async getCollectionSchedule(companyId: string): Promise<{
    overdue: Cheque[];
    thisWeek: Cheque[];
    nextWeek: Cheque[];
    thisMonth: Cheque[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    const endOfNextWeek = new Date(endOfWeek);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const baseWhere = { companyId, status: ChequeStatus.PENDING };

    const [overdue, thisWeek, nextWeek, thisMonth] = await Promise.all([
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: LessThan(today) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(today, endOfWeek) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(endOfWeek, endOfNextWeek) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
      this.chequeRepository.find({
        where: { ...baseWhere, dueDate: Between(endOfNextWeek, endOfMonth) },
        order: { dueDate: 'ASC' },
        take: 100,
      }),
    ]);

    return { overdue, thisWeek, nextWeek, thisMonth };
  }

  async remove(id: string, companyId: string): Promise<void> {
    const cheque = await this.findOne(id, companyId);
    await this.chequeRepository.remove(cheque);
  }

  private async runOcrExtraction(imageUrl: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.OCR_API_KEY;

    if (!apiKey) {
      this.logger.warn('OCR_API_KEY not configured. Returning empty OCR data.');
      return { raw: null, confidence: 0, provider: 'none' };
    }

    const response = await fetch('https://api.ocr.space/parse/imageurl', {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: imageUrl, language: 'eng', isTable: 'true' }).toString(),
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
