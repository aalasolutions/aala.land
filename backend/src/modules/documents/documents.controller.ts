import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { DocumentCategory } from '../properties/entities/property-document.entity';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Upload a document record (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateDocumentDto, @Request() req: any) {
    return this.documentsService.create(req.user.companyId, req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List documents (paginated, filtered by access level and optional category)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'category', required: false, enum: DocumentCategory })
  findAll(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: DocumentCategory,
  ) {
    return this.documentsService.findAll(req.user.companyId, req.user.role, page, limit, category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.documentsService.findOne(id, req.user.companyId, req.user.role);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get version history for a document' })
  getVersionHistory(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.documentsService.getVersionHistory(id, req.user.companyId, req.user.role);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a document (COMPANY_ADMIN+). Changing URL creates a new version.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @Request() req: any,
  ) {
    return this.documentsService.update(id, req.user.companyId, req.user.userId, req.user.role, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.documentsService.remove(id, req.user.companyId, req.user.role);
  }
}
