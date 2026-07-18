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
  create(
    @Body() dto: CreateTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.financialService.create(requireCompanyId(req.user), dto);
  }

  @Get('transactions')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'List all transactions for company (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'ownerId', required: false, type: String })
  @ApiQuery({ name: 'regionCode', required: false, type: String })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('ownerId') ownerId?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.financialService.findAll(
      requireCompanyId(req.user),
      page,
      limit,
      type,
      ownerId,
      regionCode,
    );
  }

  @Get('transactions/summary')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get financial summary for company' })
  getSummary(@Request() req: AuthenticatedRequest) {
    return this.financialService.getSummary(requireCompanyId(req.user));
  }

  @Get('deposit-reminders')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Get deposit reminders grouped by due date proximity',
  })
  getDepositReminders(@Request() req: AuthenticatedRequest) {
    return this.financialService.getDepositReminders(
      requireCompanyId(req.user),
    );
  }

  @Get('transactions/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Get transaction by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.financialService.findOne(id, requireCompanyId(req.user));
  }

  @Patch('transactions/:id')
  @Roles(Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Update transaction (ADMIN+ or Accountant)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.financialService.update(id, requireCompanyId(req.user), dto);
  }
}
