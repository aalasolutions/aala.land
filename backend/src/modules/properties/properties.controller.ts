import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  ParseEnumPipe,
  DefaultValuePipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import {
  OptionalPropertyReasonDto,
  PropertyReasonDto,
} from './dto/property-reason.dto';
import { UnitArchivedFilter } from './dto/unit-archived-filter.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId, scopedCompanyId } from '@shared/utils/auth.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadMediaDto } from './dto/upload-media.dto';

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('media/upload')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
  @ApiOperation({
    summary:
      'Upload a property photo (server-side). Compressed and re-encoded via sharp ' +
      '(2560 px max, JPEG quality 80, EXIF stripped). Thumbnail 400x400. ' +
      'Stored to Backblaze B2. Max 5 MB. Accepted: image/jpeg, image/png, image/webp.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file. Multipart field name must be "file".',
        },
        unitId: { type: 'string', format: 'uuid' },
        assetId: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: ['image', 'video', 'virtual_tour'] },
        isPrimary: { type: 'boolean' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `File type "${file.mimetype}" is not allowed. ` +
                `Accepted: ${allowed.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file provided. Send the image in a multipart/form-data field named "file".',
      );
    }
    return this.mediaService.uploadImage(requireCompanyId(req.user), file, dto);
  }

  @Get('units/:unitId/media')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List all media for a unit' })
  findUnitMedia(
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mediaService.findByUnit(requireCompanyId(req.user), unitId);
  }

  @Get('assets/:assetId/media')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List all media for an asset' })
  findAssetMedia(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mediaService.findByAsset(requireCompanyId(req.user), assetId);
  }

  @Patch('media/:id/set-primary')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
  @ApiOperation({
    summary:
      'Set a media item as primary (unsets others for the same unit/asset) (ADMIN+, AGENT)',
  })
  setPrimary(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mediaService.setPrimary(id, requireCompanyId(req.user));
  }

  @Delete('media/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a media item and its S3 files' })
  deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.mediaService.deleteMedia(id, requireCompanyId(req.user));
  }

  @Post('bulk-import')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
  @ApiOperation({ summary: 'Bulk import units from CSV (ADMIN+, AGENT)' })
  bulkImport(@Body('csv') csv: string, @Request() req: AuthenticatedRequest) {
    return this.propertiesService.bulkImportUnits(
      requireCompanyId(req.user),
      csv,
      req.user,
    );
  }

  // Assets (shared, community-seeded)
  @Get('assets/search')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Fuzzy search assets by name within a locality' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'localityId', required: true, type: String })
  searchAssets(
    @Request() req: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('localityId') localityId: string,
  ) {
    return this.propertiesService.searchAssets(
      scopedCompanyId(req.user),
      localityId,
      q,
      req.user,
    );
  }

  @Post('assets')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a new asset (tower, villa, mall, etc.)' })
  createAsset(
    @Body() dto: CreateAssetDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.createAsset(requireCompanyId(req.user), dto);
  }

  @Get('assets')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List assets where company has units (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAllAssets(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.propertiesService.findAllAssets(
      requireCompanyId(req.user),
      page,
      limit,
      req.user,
    );
  }

  @Get('localities/:localityId/assets')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'List assets in a locality where company has units (paginated)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAssetsByLocality(
    @Param('localityId', ParseUUIDPipe) localityId: string,
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.propertiesService.findAssetsByLocality(
      localityId,
      requireCompanyId(req.user),
      page,
      limit,
      req.user,
    );
  }

  @Get('assets/:id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get asset by ID (shared)' })
  findOneAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.findOneAsset(
      id,
      scopedCompanyId(req.user),
      req.user,
    );
  }

  @Patch('assets/:id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update asset (SUPER_ADMIN only, shared entity)' })
  updateAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.propertiesService.updateAsset(id, dto);
  }

  @Post('assets/:id/delete')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete asset (SUPER_ADMIN only, shared entity). 409 while any unit exists; purges its photos and documents.',
  })
  removeAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PropertyReasonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.removeAsset(id, dto.reason, req.user.userId);
  }

  // Units
  @Get('units')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary:
      'List all units (paginated, filterable). Supports amenities, propertyType, status, price range, bedrooms, localityId, and regionCode.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'amenities',
    required: false,
    type: String,
    description: 'Comma-separated amenity keys',
  })
  @ApiQuery({ name: 'propertyType', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'minBeds', required: false, type: Number })
  @ApiQuery({ name: 'maxBeds', required: false, type: Number })
  @ApiQuery({ name: 'localityId', required: false, type: String })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  @ApiQuery({
    name: 'ownerId',
    required: false,
    type: String,
    description: 'Units owned by this contact',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    description: 'One of: name, price, area, added. Anything else is ignored.',
  })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({
    name: 'archived',
    required: false,
    enum: UnitArchivedFilter,
    description: 'Defaults to exclude',
  })
  findAllUnits(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('amenities') amenitiesStr?: string,
    @Query('propertyType') propertyType?: string,
    @Query('status') status?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minBeds') minBeds?: string,
    @Query('maxBeds') maxBeds?: string,
    @Query('localityId') localityId?: string,
    @Query('regionCode') regionCode?: string,
    @Query('ownerId', new ParseUUIDPipe({ optional: true })) ownerId?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query(
      'archived',
      new ParseEnumPipe(UnitArchivedFilter, { optional: true }),
    )
    archived?: UnitArchivedFilter,
  ) {
    const filters = {
      amenities: amenitiesStr
        ? amenitiesStr
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined,
      propertyType: propertyType || undefined,
      status: status || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minBeds: minBeds ? Number(minBeds) : undefined,
      maxBeds: maxBeds ? Number(maxBeds) : undefined,
      localityId: localityId || undefined,
      regionCode: regionCode || undefined,
      ownerId: ownerId || undefined,
      archived,
    };
    return this.propertiesService.findAllUnits(
      requireCompanyId(req.user),
      page,
      limit,
      filters,
      {
        field: sort || undefined,
        direction: order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
      },
    );
  }

  // Declared before `units/:id` so the literal segment is not eaten by the param route.
  @Get('units/count-by-region')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Unit totals per region code for the topbar region switcher',
  })
  countUnitsByRegion(@Request() req: AuthenticatedRequest) {
    return this.propertiesService.countUnitsByRegion(
      requireCompanyId(req.user),
      req.user,
    );
  }

  @Get('units/:id')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'Get unit by ID with asset, locality, and owner relations',
  })
  findOneUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.findOneUnit(
      id,
      requireCompanyId(req.user),
      req.user,
    );
  }

  @Post('units')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
  @ApiOperation({ summary: 'Create a new unit (ADMIN+, AGENT)' })
  createUnit(@Body() dto: CreateUnitDto, @Request() req: AuthenticatedRequest) {
    return this.propertiesService.createUnit(
      requireCompanyId(req.user),
      dto,
      req.user.userId,
      req.user,
    );
  }

  @Get('assets/:assetId/units')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'List units in an asset (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'archived',
    required: false,
    enum: UnitArchivedFilter,
    description: 'Defaults to exclude',
  })
  findUnitsByAsset(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query(
      'archived',
      new ParseEnumPipe(UnitArchivedFilter, { optional: true }),
    )
    archived?: UnitArchivedFilter,
  ) {
    return this.propertiesService.findUnitsByAsset(
      assetId,
      requireCompanyId(req.user),
      page,
      limit,
      req.user,
      archived,
    );
  }

  @Patch('units/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
  @ApiOperation({ summary: 'Update unit (ADMIN+, AGENT)' })
  updateUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.updateUnit(
      id,
      requireCompanyId(req.user),
      dto,
      req.user.userId,
      req.user,
    );
  }

  @Post('units/:id/delete')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete unit (COMPANY_ADMIN+). 409 when leases, cheques, transactions, work orders or leads reference it; purges its photos and documents.',
  })
  removeUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PropertyReasonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.removeUnit(
      id,
      requireCompanyId(req.user),
      dto.reason,
      req.user.userId,
      req.user,
    );
  }

  @Post('units/:id/archive')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Archive unit. 409 when already archived or under an ACTIVE lease.',
  })
  archiveUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PropertyReasonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.archiveUnit(
      id,
      requireCompanyId(req.user),
      dto.reason,
      req.user.userId,
      req.user,
    );
  }

  @Post('units/:id/unarchive')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive unit. 409 when not archived.' })
  unarchiveUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionalPropertyReasonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertiesService.unarchiveUnit(
      id,
      requireCompanyId(req.user),
      dto.reason,
      req.user.userId,
      req.user,
    );
  }

  @Get('occupancy')
  @Roles(
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Asset-level occupancy rates' })
  getOccupancy(@Request() req: AuthenticatedRequest) {
    return this.propertiesService.getAssetOccupancy(
      requireCompanyId(req.user),
      req.user,
    );
  }
}
