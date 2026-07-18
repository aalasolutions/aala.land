import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { WhatsappSettings } from './entities/whatsapp-settings.entity';
import { UpdateWhatsappSettingsDto } from './dto/update-whatsapp-settings.dto';
import { WhatsappAiService } from './whatsapp-ai.service';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY_ADMIN)
@Controller('whatsapp/settings')
export class WhatsappSettingsController {
  constructor(
    @InjectRepository(WhatsappSettings)
    private readonly settingsRepo: Repository<WhatsappSettings>,
    private readonly aiService: WhatsappAiService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get WhatsApp settings for the caller's company" })
  async getSettings(@Request() req: AuthenticatedRequest) {
    const companyId = req.user.companyId!;
    const settings = await this.settingsRepo.findOne({ where: { companyId } });
    return { aiPrompt: settings?.aiPrompt ?? null };
  }

  @Patch()
  @ApiOperation({
    summary: "Update WhatsApp settings for the caller's company",
  })
  async updateSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdateWhatsappSettingsDto,
  ) {
    const companyId = req.user.companyId!;
    const existing = await this.settingsRepo.findOne({ where: { companyId } });
    const aiPrompt =
      body.aiPrompt === undefined
        ? (existing?.aiPrompt ?? null)
        : typeof body.aiPrompt === 'string' && body.aiPrompt.trim() !== ''
          ? body.aiPrompt.trim()
          : null;
    const entity = this.settingsRepo.create({
      ...existing,
      companyId,
      aiPrompt,
    });
    const saved = await this.settingsRepo.save(entity);
    this.aiService.clearPromptCache(companyId);
    return { aiPrompt: saved.aiPrompt ?? null };
  }
}
