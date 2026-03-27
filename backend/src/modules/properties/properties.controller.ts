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
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';
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

    @Get('buildings/:buildingId/media')
    @ApiOperation({ summary: 'List all media for a building' })
    findBuildingMedia(@Param('buildingId', ParseUUIDPipe) buildingId: string, @Request() req: AuthenticatedRequest) {
        return this.mediaService.findByBuilding(req.user.companyId, buildingId);
    }

    @Patch('media/:id/set-primary')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Set a media item as primary (unsets others for the same unit/building)' })
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

    // Areas
    @Post('areas')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new property area (COMPANY_ADMIN+)' })
    createArea(@Body() dto: CreateAreaDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createArea(req.user.companyId, dto);
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

    // Buildings
    @Post('buildings')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new building (COMPANY_ADMIN+)' })
    createBuilding(@Body() dto: CreateBuildingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createBuilding(req.user.companyId, dto);
    }

    @Get('areas/:areaId/buildings')
    @ApiOperation({ summary: 'List buildings in an area (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findBuildings(
        @Param('areaId', ParseUUIDPipe) areaId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findBuildingsByArea(areaId, req.user.companyId, page, limit);
    }

    @Patch('buildings/:id')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Update building (COMPANY_ADMIN+)' })
    updateBuilding(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBuildingDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.updateBuilding(id, req.user.companyId, dto);
    }

    @Delete('buildings/:id')
    @Roles(Role.COMPANY_ADMIN)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete building (COMPANY_ADMIN+)' })
    removeBuilding(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.removeBuilding(id, req.user.companyId);
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
            regionCode: regionCode || undefined,
        };
        return this.propertiesService.findAllUnits(req.user.companyId, page, limit, filters);
    }

    @Get('units/:id')
    @ApiOperation({ summary: 'Get unit by ID with building, area, and owner relations' })
    findOneUnit(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.findOneUnit(id, req.user.companyId);
    }

    @Post('units')
    @Roles(Role.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Create a new unit (COMPANY_ADMIN+)' })
    createUnit(@Body() dto: CreateUnitDto, @Request() req: AuthenticatedRequest) {
        return this.propertiesService.createUnit(req.user.companyId, dto);
    }

    @Get('buildings/:buildingId/units')
    @ApiOperation({ summary: 'List units in a building (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findUnits(
        @Param('buildingId', ParseUUIDPipe) buildingId: string,
        @Request() req: AuthenticatedRequest,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        return this.propertiesService.findUnitsByBuilding(buildingId, req.user.companyId, page, limit);
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
    @ApiOperation({ summary: 'Building-level occupancy rates' })
    getOccupancy(@Request() req: AuthenticatedRequest) {
        return this.propertiesService.getBuildingOccupancy(req.user.companyId);
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
