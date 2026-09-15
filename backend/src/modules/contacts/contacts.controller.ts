import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Request,
  Query,
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
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { DeleteContactDto } from './dto/delete-contact.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
  )
  @ApiOperation({ summary: 'Create a new contact (ADMIN+, AGENT)' })
  create(@Body() dto: CreateContactDto, @Request() req: AuthenticatedRequest) {
    return this.contactsService.create(
      requireCompanyId(req.user),
      dto,
      req.user.userId,
      { role: req.user.role, regionCodes: req.user.regionCodes },
    );
  }

  @Get()
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({
    summary: 'List contacts for current company (paginated, searchable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'tag',
    required: false,
    enum: ['lead', 'tenant', 'owner', 'vendor'],
    description: 'Filter by derived role tag',
  })
  @ApiQuery({
    name: 'agentId',
    required: false,
    type: String,
    description: 'Contacts with a lead or owned unit assigned to this agent',
  })
  @ApiQuery({ name: 'isWhatsapp', required: false, type: Boolean })
  @ApiQuery({ name: 'company', required: false, type: String })
  @ApiQuery({ name: 'nationality', required: false, type: String })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'ISO date, inclusive lower bound on createdAt',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'ISO date, inclusive upper bound on createdAt',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('tag') tag?: 'lead' | 'tenant' | 'owner' | 'vendor',
    @Query('agentId', new ParseUUIDPipe({ optional: true })) agentId?: string,
    @Query('isWhatsapp') isWhatsapp?: string,
    @Query('company') company?: string,
    @Query('nationality') nationality?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    if (dateFrom && isNaN(Date.parse(dateFrom))) {
      throw new BadRequestException('dateFrom is not a valid date');
    }
    if (dateTo && isNaN(Date.parse(dateTo))) {
      throw new BadRequestException('dateTo is not a valid date');
    }
    return this.contactsService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      search,
      tag,
      {
        agentId: agentId || undefined,
        isWhatsapp: isWhatsapp ? isWhatsapp === 'true' : undefined,
        company: company || undefined,
        nationality: nationality || undefined,
        regionCode: regionCode || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      req.user,
    );
  }

  @Get(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get a contact by ID (scoped to company)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contactsService.findOne(id, requireCompanyId(req.user), {
      role: req.user.role,
      regionCodes: req.user.regionCodes,
    });
  }

  @Patch(':id')
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
  )
  @ApiOperation({ summary: 'Update a contact (ADMIN+, AGENT)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contactsService.update(id, requireCompanyId(req.user), dto, {
      role: req.user.role,
      regionCodes: req.user.regionCodes,
    });
  }

  @Post(':id/delete')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete a contact with a reason (SUPER_ADMIN, COMPANY_ADMIN, ADMIN)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteContactDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contactsService.remove(
      id,
      requireCompanyId(req.user),
      dto,
      req.user.userId,
      { role: req.user.role, regionCodes: req.user.regionCodes },
    );
  }
}
