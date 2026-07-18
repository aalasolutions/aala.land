import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
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
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.contactsService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      search,
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
    return this.contactsService.findOne(id, requireCompanyId(req.user));
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
    return this.contactsService.update(id, requireCompanyId(req.user), dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a contact (SUPER_ADMIN, COMPANY_ADMIN, ADMIN)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contactsService.remove(id, requireCompanyId(req.user));
  }
}
