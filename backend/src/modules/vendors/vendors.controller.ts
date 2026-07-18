import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorSpecialty } from './entities/vendor.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a vendor (ADMIN+)' })
  create(@Body() dto: CreateVendorDto, @Request() req: AuthenticatedRequest) {
    return this.vendorsService.create(requireCompanyId(req.user), dto);
  }

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'List vendors (paginated, searchable, filterable by specialty)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'specialty', required: false, enum: VendorSpecialty })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('specialty') specialty?: VendorSpecialty,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.vendorsService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      search,
      specialty,
      regionCode,
    );
  }

  @Get(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get a vendor by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vendorsService.findOne(id, requireCompanyId(req.user));
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update a vendor (ADMIN+)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vendorsService.update(id, requireCompanyId(req.user), dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a vendor (ADMIN+)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vendorsService.remove(id, requireCompanyId(req.user));
  }
}
