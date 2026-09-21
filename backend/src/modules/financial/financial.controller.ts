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
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { QueryFinancialRangeDto } from './dto/query-financial-range.dto';
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
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query() query?: QueryTransactionsDto,
  ) {
    return this.financialService.findAll(requireCompanyId(req.user), {
      page,
      limit,
      type: query?.type,
      ownerId: query?.ownerId,
      regionCode: query?.regionCode,
      caller: req.user,
      from: query?.from,
      to: query?.to,
    });
  }

  @Get('transactions/summary')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get financial summary for company' })
  getSummary(
    @Request() req: AuthenticatedRequest,
    @Query() query?: QueryFinancialRangeDto,
  ) {
    return this.financialService.getSummary(requireCompanyId(req.user), {
      regionCode: query?.regionCode,
      caller: req.user,
      from: query?.from,
      to: query?.to,
    });
  }

  @Get('category-breakdown')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Transaction totals by category for a date range' })
  getCategoryBreakdown(
    @Request() req: AuthenticatedRequest,
    @Query() query?: QueryFinancialRangeDto,
  ) {
    return this.financialService.getCategoryBreakdown(
      requireCompanyId(req.user),
      {
        from: query?.from,
        to: query?.to,
        regionCode: query?.regionCode,
        caller: req.user,
      },
    );
  }

  @Get('cashflow-trend')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Income and expense over consecutive periods the length of the given range, ending with it',
  })
  getCashflowTrend(
    @Request() req: AuthenticatedRequest,
    @Query() query?: QueryFinancialRangeDto,
  ) {
    return this.financialService.getCashflowTrend(requireCompanyId(req.user), {
      regionCode: query?.regionCode,
      caller: req.user,
      from: query?.from,
      to: query?.to,
    });
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
