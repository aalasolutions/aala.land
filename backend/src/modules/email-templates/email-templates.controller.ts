import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EmailTemplatesService } from './email-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { RenderEmailTemplateDto } from './dto/render-email-template.dto';
import { EmailTemplateCategory } from './entities/email-template.entity';

@ApiTags('Email Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly emailTemplatesService: EmailTemplatesService) { }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a new email template (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateEmailTemplateDto, @Request() req) {
    return this.emailTemplatesService.create(req.user.companyId, dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all email templates for company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, enum: EmailTemplateCategory })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: EmailTemplateCategory,
  ) {
    return this.emailTemplatesService.findAll(req.user.companyId, page, limit, category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email template by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.emailTemplatesService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update email template (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmailTemplateDto, @Request() req) {
    return this.emailTemplatesService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete email template (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.emailTemplatesService.remove(id, req.user.companyId);
  }

  @Post(':id/render')
  @ApiOperation({ summary: 'Render email template with variables (preview)' })
  render(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenderEmailTemplateDto, @Request() req) {
    return this.emailTemplatesService.render(id, req.user.companyId, dto.variables);
  }
}
