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
import { requireCompanyId } from '@shared/utils/auth.util';

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
        return this.mediaService.getPresignedUploadUrl(requireCompanyId(req.user), dto);
    }

    @Post('media')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Create a media record after S3 upload. Generates thumbnail for images. (ADMIN+, AGENT)' })
    createMedia(@Body() dto: CreateMediaDto, @Request() req: AuthenticatedRequest) {
        return this.mediaService.createMedia(requireCompanyId(req.user), dto);
    }

    @Get('units/:unitId/media')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List all media for a unit' })
    findUnitMedia(@Param('unitId', ParseUUIDPipe) unitId: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.findByUnit(requireCompanyId(req.user), unitId);
    }

    @Get('assets/:assetId/media')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List all media for an asset' })
    findAssetMedia(@Param('assetId', ParseUUIDPipe) assetId: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.findByAsset(requireCompanyId(req.user), assetId);
    }

    @Patch('media/:id/set-primary')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Set a media item as primary (unsets others for the same unit/asset) (ADMIN+, AGENT)' })
    setPrimary(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.setPrimary(id, requireCompanyId(req.user));
    }

    @Delete('media/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a media item and its S3 files' })
    deleteMedia(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.deleteMedia(id, requireCompanyId(req.user));
    }

    @Post('bulk-import')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Bulk import units from CSV (ADMIN+, AGENT)' })
    bulkImport(@Body('csv') csv: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.bulkImportUnits(requireCompanyId(req.user), csv);
    }

    // Areas (deprecated, kept for backward compat)
    @Post('areas')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Create a new property area (ADMIN+, AGENT)' })
    @ApiQuery({ name: 'regionCode', required: false, type: String })
    createArea(@Body() dto: CreateAreaDto, @Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
        const enrichedDto = regionCode ? { ...dto, regionCode } : dto;
        return this.propertiesService.createArea(requireCompanyId(req.user), enrichedDto);
    }

    @Get('areas')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
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
        return this.propertiesService.findAllAreas(requireCompanyId(req.user), page, limit, regionCode);
    }

    @Get('areas/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Get area by ID' })
    findOneArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneArea(id, requireCompanyId(req.user));
    }

    @Patch('areas/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Update area (ADMIN+, AGENT)' })
    updateArea(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateArea(id, requireCompanyId(req.user), dto);
    }

    @Delete('areas/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete area (COMPANY_ADMIN+)' })
    removeArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeArea(id, requireCompanyId(req.user));
    }

    // Assets (shared, community-seeded)
    @Get('assets/search')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Fuzzy search assets by name within a locality' })
    @ApiQuery({ name: 'q', required: true, type: String })
    @ApiQuery({ name: 'localityId', required: true, type: String })
    searchAssets(@Query('q') q: string, @Query('localityId') localityId: string) {
        return this.propertiesService.searchAssets(localityId, q);
    }

    @Post('assets')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
    @ApiOperation({ summary: 'Create a new asset (tower, villa, mall, etc.)' })
    createAsset(@Body() dto: CreateAssetDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createAsset(requireCompanyId(req.user), dto);
    }

    @Get('assets')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List assets where company has units (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAllAssets(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAllAssets(requireCompanyId(req.user), page, limit);
    }

    @Get('localities/:localityId/assets')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List assets in a locality where company has units (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAssetsByLocality(
        @Param('localityId', ParseUUIDPipe) localityId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAssetsByLocality(localityId, requireCompanyId(req.user), page, limit);
    }

    @Get('assets/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
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
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List all units (paginated, filterable). Supports amenities, propertyType, status, price range, bedrooms, localityId, and regionCode.' })
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
        return this.propertiesService.findAllUnits(requireCompanyId(req.user), page, limit, filters);
    }

    @Get('units/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Get unit by ID with asset, locality, and owner relations' })
    findOneUnit(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneUnit(id, requireCompanyId(req.user));
    }

    @Post('units')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Create a new unit (ADMIN+, AGENT)' })
    createUnit(@Body() dto: CreateUnitDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createUnit(requireCompanyId(req.user), dto);
    }

    @Get('assets/:assetId/units')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List units in an asset (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findUnitsByAsset(
        @Param('assetId', ParseUUIDPipe) assetId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findUnitsByAsset(assetId, requireCompanyId(req.user), page, limit);
    }

    @Patch('units/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Update unit (ADMIN+, AGENT)' })
    updateUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateUnit(id, requireCompanyId(req.user), dto);
    }

    @Delete('units/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete unit (COMPANY_ADMIN+)' })
    removeUnit(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeUnit(id, requireCompanyId(req.user));
    }

    @Get('occupancy')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Asset-level occupancy rates' })
    getOccupancy(@Request() req: AuthenticatedRequest) {
        return this.propertiesService.getAssetOccupancy(requireCompanyId(req.user));
    }

    // Listings
    @Post('listings')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Create a property listing (ADMIN+, AGENT)' })
    createListing(@Body() dto: CreateListingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createListing(requireCompanyId(req.user), dto);
    }

    @Get('listings')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'List all property listings (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAllListings(
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findAllListings(requireCompanyId(req.user), page, limit);
    }

    @Get('listings/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT, Role.ACCOUNTANT)
    @ApiOperation({ summary: 'Get a listing by ID' })
    findOneListing(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneListing(id, requireCompanyId(req.user));
    }

    @Patch('listings/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.AGENT)
    @ApiOperation({ summary: 'Update a listing (ADMIN+, AGENT)' })
    updateListing(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateListing(id, requireCompanyId(req.user), dto);
    }

    @Delete('listings/:id')
    @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a listing' })
    removeListing(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeListing(id, requireCompanyId(req.user));
    }
}
