import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';
import {
  DataTransferService,
  type TemplateFile,
} from './data-transfer.service';
import { TemplateQueryDto } from './dto/template-query.dto';
import { ImportBodyDto } from './dto/import-body.dto';
import { FailedFileBodyDto } from './dto/failed-file.dto';
import { importUploadOptions } from './upload.util';

const UPLOAD_BODY = {
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      regionCode: { type: 'string' },
    },
    required: ['file'],
  },
};

@ApiTags('Data Transfer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('data-transfer')
export class DataTransferController {
  constructor(private readonly dataTransferService: DataTransferService) {}

  @Get(':entity/template')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Download the import template for an entity (COMPANY_ADMIN)',
  })
  @ApiParam({ name: 'entity', enum: ['contacts'] })
  async template(
    @Param('entity') entity: string,
    @Query() query: TemplateQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.dataTransferService.templateFile(
      entity,
      requireCompanyId(req.user),
      query.format,
    );
    sendFile(res, file);
  }

  @Post(':entity/preview')
  @Roles(Role.COMPANY_ADMIN)
  @UseInterceptors(FileInterceptor('file', importUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOperation({
    summary:
      'Validate an import file and report what would happen (COMPANY_ADMIN)',
  })
  @ApiParam({ name: 'entity', enum: ['contacts'] })
  preview(
    @Param('entity') entity: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImportBodyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.dataTransferService.preview(
      entity,
      file,
      req.user,
      requireCompanyId(req.user),
      body.regionCode,
    );
  }

  @Post(':entity/commit')
  @Roles(Role.COMPANY_ADMIN)
  @UseInterceptors(FileInterceptor('file', importUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOperation({ summary: 'Import the valid rows of a file (COMPANY_ADMIN)' })
  @ApiParam({ name: 'entity', enum: ['contacts'] })
  commit(
    @Param('entity') entity: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImportBodyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.dataTransferService.commit(
      entity,
      file,
      req.user,
      requireCompanyId(req.user),
      body.regionCode,
    );
  }

  @Post(':entity/failed-file')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Download the rows that were not imported, with a Reason column',
  })
  @ApiParam({ name: 'entity', enum: ['contacts'] })
  async failedFile(
    @Param('entity') entity: string,
    @Query() query: TemplateQueryDto,
    @Body() body: FailedFileBodyDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.dataTransferService.failedFile(
      entity,
      requireCompanyId(req.user),
      body.rows,
      query.format,
    );
    sendFile(res, file);
  }
}

function sendFile(res: Response, file: TemplateFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName}"`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
}
