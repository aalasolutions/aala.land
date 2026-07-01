import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, Request, Res, ParseIntPipe, ParseUUIDPipe,
  DefaultValuePipe, HttpCode, HttpStatus, Logger,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';
import { DocumentCategory } from '../properties/entities/property-document.entity';
import { ALLOWED_DOCUMENT_TYPES } from '../properties/media.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadDocumentDto } from './dto/upload-document.dto';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('upload')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Upload a document file and create its DB record in one request.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file. Multipart field name must be "file".',
        },
        name:        { type: 'string' },
        unitId:      { type: 'string', format: 'uuid' },
        assetId:     { type: 'string', format: 'uuid' },
        category: {
          type: 'string',
          enum: Object.values(DocumentCategory),
        },
        accessLevel: {
          type: 'string',
          enum: ['PUBLIC', 'COMPANY', 'OWNER_ONLY', 'ADMIN_ONLY'],
        },
      },
      required: ['file', 'name'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
      fileFilter: (_req, file, cb) => {
        if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `File type "${file.mimetype}" is not allowed. ` +
              `Accepted: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file provided. Send the document in a multipart/form-data field named "file".',
      );
    }
    const companyId = requireCompanyId(req.user);
    return this.documentsService.uploadAndCreate(
      companyId,
      req.user.userId,
      file,
      dto,
    );
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List documents (paginated, filtered by access level and optional category)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'category', required: false, enum: DocumentCategory })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: DocumentCategory,
  ) {
    return this.documentsService.findAll(requireCompanyId(req.user), req.user.role, page, limit, category);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get a document by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.documentsService.findOne(id, requireCompanyId(req.user), req.user.role);
  }

  @Get(':id/versions')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get version history for a document' })
  getVersionHistory(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.documentsService.getVersionHistory(id, requireCompanyId(req.user), req.user.role);
  }

  @Get(':id/download')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Stream a document\'s file bytes. Re-checks accessLevel before serving — ' +
      'the S3 URL is never exposed to the client.',
  })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, doc } = await this.documentsService.downloadStream(
      id,
      requireCompanyId(req.user),
      req.user.role,
    );
    // Strip quotes and control characters (including CR/LF) so a document name
    // can never inject extra headers or break the Content-Disposition value.
    const safeFileName = (doc.name || 'document').replace(/[\x00-\x1f\x7f"]/g, '_');
    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.on('error', (err) => {
      this.logger.error(`Document stream failed for ${id}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to stream document',
          error: 'Internal Server Error',
          statusCode: 500,
        });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a document\'s metadata (ADMIN+). Replacing the file itself requires a new upload.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.documentsService.update(id, requireCompanyId(req.user), req.user.role, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document (SUPER_ADMIN, COMPANY_ADMIN, ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    return this.documentsService.remove(
      id,
      requireCompanyId(req.user),
      req.user.role,
    );
  }
}
