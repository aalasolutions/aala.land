import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, ParseUUIDPipe, DefaultValuePipe, UseGuards, Request, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@ApiTags('Financial')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) { }

  @Post('transactions')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a new transaction (COMPANY_ADMIN+)' })
  create(@Body() dto: CreateTransactionDto, @Request() req) {
    return this.financialService.create(req.user.companyId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List all transactions for company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'ownerId', required: false, type: String })
  findAll(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.financialService.findAll(req.user.companyId, page, limit, ownerId);
  }

  @Get('transactions/summary')
  @ApiOperation({ summary: 'Get financial summary for company' })
  getSummary(@Request() req) {
    return this.financialService.getSummary(req.user.companyId);
  }

  @Get('deposit-reminders')
  @Roles(Role.COMPANY_ADMIN, Role.AGENT)
  @ApiOperation({ summary: 'Get deposit reminders grouped by due date proximity' })
  getDepositReminders(@Request() req) {
    return this.financialService.getDepositReminders(req.user.companyId);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.financialService.findOne(id, req.user.companyId);
  }

  @Patch('transactions/:id')
  @Roles(Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update transaction (COMPANY_ADMIN+)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto, @Request() req) {
    return this.financialService.update(id, req.user.companyId, dto);
  }
}
