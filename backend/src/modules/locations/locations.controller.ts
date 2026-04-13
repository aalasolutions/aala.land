import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { SearchCityDto } from './dto/search-city.dto';
import { SearchLocalityDto } from './dto/search-locality.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateLocalityDto } from './dto/create-locality.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';

@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) { }

    @Get('cities/search')
    @ApiOperation({ summary: 'Fuzzy search cities by name within a region' })
    searchCities(@Query() dto: SearchCityDto) {
        return this.locationsService.searchCities(dto);
    }

    @Post('cities')
    @ApiOperation({ summary: 'Create a new city' })
    createCity(@Body() dto: CreateCityDto, @Request() req: AuthenticatedRequest) {
        return this.locationsService.createCity(dto, req.user.companyId);
    }

    @Get('cities/:regionCode')
    @ApiOperation({ summary: 'List all cities for a region' })
    getCitiesByRegion(@Param('regionCode') regionCode: string) {
        return this.locationsService.getCitiesByRegion(regionCode);
    }

    @Get('localities/search')
    @ApiOperation({ summary: 'Fuzzy search localities by name within a city' })
    searchLocalities(@Query() dto: SearchLocalityDto) {
        return this.locationsService.searchLocalities(dto);
    }

    @Post('localities')
    @ApiOperation({ summary: 'Create a new locality' })
    createLocality(@Body() dto: CreateLocalityDto, @Request() req: AuthenticatedRequest) {
        return this.locationsService.createLocality(dto, req.user.companyId);
    }

    @Get('localities/:cityId')
    @ApiOperation({ summary: 'List all localities for a city' })
    getLocalitiesByCity(@Param('cityId') cityId: string) {
        return this.locationsService.getLocalitiesByCity(cityId);
    }

    @Get('company/localities')
    @ApiOperation({ summary: 'List localities that have assets for the current company' })
    getCompanyLocalities(@Request() req: AuthenticatedRequest, @Query('regionCode') regionCode?: string) {
        return this.locationsService.getCompanyLocalities(req.user.companyId, regionCode);
    }
}
