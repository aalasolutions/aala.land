import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.AGENT)
  @ApiOperation({ summary: 'Create a new contact' })
  create(@Body() dto: CreateContactDto, @Request() req) {
    return this.contactsService.create(req.user.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List contacts for current company (paginated, searchable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.contactsService.findAll(req.user.companyId, page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contact by ID (scoped to company)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.contactsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN, Role.AGENT)
  @ApiOperation({ summary: 'Update a contact' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto, @Request() req) {
    return this.contactsService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact (COMPANY_ADMIN+)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.contactsService.remove(id, req.user.companyId);
  }
}
