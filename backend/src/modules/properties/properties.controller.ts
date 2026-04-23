import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { CreateMediaDto } from './dto/create-media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('properties')
export class PropertiesController {
    constructor(
        private readonly propertiesService: PropertiesService,
        private readonly mediaService: MediaService,
    ) { }

    @Post('media/presigned-url')
    @ApiOperation({ summary: 'Get S3 presigned URL for uploading property photos' })
    getPresignedUrl(@Body() dto: PresignedUrlDto, @Request() req: AuthenticatedRequest) {
        return this.mediaService.getPresignedUploadUrl(req.user.companyId, dto);
    }

    @Post('media')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a media record after S3 upload. Generates thumbnail for images.' })
    createMedia(@Body() dto: CreateMediaDto, @Request() req: AuthenticatedRequest) {
        return this.mediaService.createMedia(req.user.companyId, dto);
    }

    @Get('units/:unitId/media')
    @ApiOperation({ summary: 'List all media for a unit' })
    findUnitMedia(@Param('unitId', ParseUUIDPipe) unitId: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.findByUnit(req.user.companyId, unitId);
    }

    @Get('assets/:assetId/media')
    @ApiOperation({ summary: 'List all media for an asset' })
    findAssetMedia(@Param('assetId', ParseUUIDPipe) assetId: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.findByAsset(req.user.companyId, assetId);
    }

    @Patch('media/:id/set-primary')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Set a media item as primary (unsets others for the same unit/asset)' })
    setPrimary(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.setPrimary(id, req.user.companyId);
    }

    @Delete('media/:id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a media item and its S3 files' })
    deleteMedia(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.deleteMedia(id, req.user.companyId);
    }

    @Post('bulk-import')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Bulk import units from CSV (COMPANY_ADMIN+)' })
    bulkImport(@Body('csv') csv: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.bulkImportUnits(req.user.companyId, csv);
    }

    // Areas (deprecated, kept for backward compat)
    @Post('areas')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new property area (COMPANY_ADMIN+)' })
    @ApiQuery({ name: 'regionCode', required: false, type: String })
    createArea(@Body() dto: CreateAreaDto, @Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
        const enrichedDto = regionCode ? { ...dto, regionCode } : dto;
        return this.propertiesService.createArea(req.user.companyId, enrichedDto);
    }

    @Get('areas')
    @ApiOperation({ summary: 'List all property areas (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'regionCode', required: false, type: String })
    findAllAreas(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
        @Query('regionCode') regionCode?: string,
    ) {
        return this.propertiesService.findAllAreas(req.user.companyId, page, limit, regionCode);
    }

    @Get('areas/:id')
    @ApiOperation({ summary: 'Get area by ID' })
    findOneArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneArea(id, req.user.companyId);
    }

    @Patch('areas/:id')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Update area (COMPANY_ADMIN+)' })
    updateArea(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateArea(id, req.user.companyId, dto);
    }

    @Delete('areas/:id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete area (COMPANY_ADMIN+)' })
    removeArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeArea(id, req.user.companyId);
    }

    // Assets (shared, community-seeded)
    @Get('assets/search')
    @ApiOperation({ summary: 'Fuzzy search assets by name within a locality' })
    @ApiQuery({ name: 'q', required: true, type: String })
    @ApiQuery({ name: 'localityId', required: true, type: String })
    searchAssets(@Query('q') q: string, @Query('localityId') localityId: string) {
        return this.propertiesService.searchAssets(localityId, q);
    }

    @Post('assets')
    @ApiOperation({ summary: 'Create a new asset (tower, villa, mall, etc.)' })
    createAsset(@Body() dto: CreateAssetDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createAsset(req.user.companyId, dto);
    }

    @Get('assets')
    @ApiOperation({ summary: 'List assets where company has units (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAllAssets(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAllAssets(req.user.companyId, page, limit);
    }

    @Get('localities/:localityId/assets')
    @ApiOperation({ summary: 'List assets in a locality where company has units (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAssetsByLocality(
        @Param('localityId', ParseUUIDPipe) localityId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAssetsByLocality(localityId, req.user.companyId, page, limit);
    }

    @Get('assets/:id')
    @ApiOperation({ summary: 'Get asset by ID (shared)' })
    findOneAsset(@Param('id', ParseUUIDPipe) id: string) {
        return this.propertiesService.findOneAsset(id);
    }

    @Patch('assets/:id')
    @Roles(Role.SUPER_ADMIN)
    @ApiOperation({ summary: 'Update asset (SUPER_ADMIN only, shared entity)' })
    updateAsset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
        return this.propertiesService.updateAsset(id, dto);
    }

    @Delete('assets/:id')
    @Roles(Role.SUPER_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete asset (SUPER_ADMIN only, shared entity)' })
    removeAsset(@Param('id', ParseUUIDPipe) id: string) {
        return this.propertiesService.removeAsset(id);
    }

    // Units
    @Get('units')
    @ApiOperation({ summary: 'List all units (paginated, filterable). Supports amenities, propertyType, status, price range, bedrooms, regionCode.' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'amenities', required: false, type: String, description: 'Comma-separated amenity keys' })
    @ApiQuery({ name: 'propertyType', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'minPrice', required: false, type: Number })
    @ApiQuery({ name: 'maxPrice', required: false, type: Number })
    @ApiQuery({ name: 'minBeds', required: false, type: Number })
    @ApiQuery({ name: 'maxBeds', required: false, type: Number })
    @ApiQuery({ name: 'localityId', required: false, type: String })
    @ApiQuery({ name: 'regionCode', required: false, type: String })
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
    ) {
        const filters = {
            amenities: amenitiesStr ? amenitiesStr.split(',').map(a => a.trim()).filter(Boolean) : undefined,
            propertyType: propertyType || undefined,
            status: status || undefined,
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
            minBeds: minBeds ? Number(minBeds) : undefined,
            maxBeds: maxBeds ? Number(maxBeds) : undefined,
            localityId: localityId || undefined,
            regionCode: regionCode || undefined,
        };
        return this.propertiesService.findAllUnits(req.user.companyId, page, limit, filters);
    }

    @Get('units/:id')
    @ApiOperation({ summary: 'Get unit by ID with asset, locality, and owner relations' })
    findOneUnit(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneUnit(id, req.user.companyId);
    }

    @Post('units')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new unit (COMPANY_ADMIN+)' })
    createUnit(@Body() dto: CreateUnitDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createUnit(req.user.companyId, dto);
    }

    @Get('assets/:assetId/units')
    @ApiOperation({ summary: 'List units in an asset (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findUnitsByAsset(
        @Param('assetId', ParseUUIDPipe) assetId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findUnitsByAsset(assetId, req.user.companyId, page, limit);
    }

    @Patch('units/:id')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Update unit (COMPANY_ADMIN+)' })
    updateUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateUnit(id, req.user.companyId, dto);
    }

    @Delete('units/:id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete unit (COMPANY_ADMIN+)' })
    removeUnit(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeUnit(id, req.user.companyId);
    }

    @Get('occupancy')
    @ApiOperation({ summary: 'Asset-level occupancy rates' })
    getOccupancy(@Request() req: AuthenticatedRequest) {
        return this.propertiesService.getAssetOccupancy(req.user.companyId);
    }

    // Listings
    @Post('listings')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a property listing' })
    createListing(@Body() dto: CreateListingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createListing(req.user.companyId, dto);
    }

    @Get('listings')
    @ApiOperation({ summary: 'List all property listings (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAllListings(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAllListings(req.user.companyId, page, limit);
    }

    @Get('listings/:id')
    @ApiOperation({ summary: 'Get a listing by ID' })
    findOneListing(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneListing(id, req.user.companyId);
    }

    @Patch('listings/:id')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Update a listing' })
    updateListing(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateListing(id, req.user.companyId, dto);
    }

    @Delete('listings/:id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a listing' })
    removeListing(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeListing(id, req.user.companyId);
    }
}
