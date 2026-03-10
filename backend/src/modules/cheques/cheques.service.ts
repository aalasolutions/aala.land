import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cheque, ChequeStatus } from './entities/cheque.entity';
import { CreateChequeDto } from './dto/create-cheque.dto';
import { UpdateChequeDto } from './dto/update-cheque.dto';

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
  ): Promise<{ data: Cheque[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.chequeRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
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
      this.logger.error(`OCR failed for cheque ${id}: ${err.message}`);
      cheque.ocrProcessed = false;
    }

    return this.chequeRepository.save(cheque);
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
