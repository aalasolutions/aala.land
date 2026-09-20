import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  UseGuards,
  Request,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FinancialService } from './financial.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';

@ApiTags('Financial')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Post('transactions')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a new transaction (ADMIN+ or Accountant)' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  create(
    @Body() dto: CreateTransactionDto,
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.create(
      requireCompanyId(req.user),
      dto,
      regionCode || undefined,
      req.user,
    );
  }

  @Get('transactions')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List all transactions for company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'ownerId', required: false, type: String })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('ownerId') ownerId?: string,
    @Query('regionCode') regionCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financialService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      type,
      ownerId,
      regionCode,
      req.user,
      from,
      to,
    );
  }

  @Get('transactions/summary')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get financial summary for company' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  getSummary(
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financialService.getSummary(
      requireCompanyId(req.user),
      regionCode,
      req.user,
      from,
      to,
    );
  }

  @Get('category-breakdown')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Transaction totals by category for a date range' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  getCategoryBreakdown(
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financialService.getCategoryBreakdown(
      requireCompanyId(req.user),
      from,
      to,
      regionCode,
      req.user,
    );
  }

  @Get('cashflow-trend')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Income and expense per month, last 6 months' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getCashflowTrend(
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.getCashflowTrend(
      requireCompanyId(req.user),
      6,
      regionCode,
      req.user,
    );
  }

  @Get('deposit-reminders')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get deposit reminders grouped by due date proximity',
  })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  getDepositReminders(
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.getDepositReminders(
      requireCompanyId(req.user),
      regionCode,
      req.user,
    );
  }

  @Get('transactions/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.findOne(
      id,
      requireCompanyId(req.user),
      regionCode,
      req.user,
    );
  }

  @Patch('transactions/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Update transaction (ADMIN+ or Accountant)' })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
    @Request() req: AuthenticatedRequest,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.update(
      id,
      requireCompanyId(req.user),
      dto,
      regionCode,
      req.user,
    );
  }
}
