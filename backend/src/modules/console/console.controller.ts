import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { ConsoleService, OperatorActor } from './console.service';
import { GrantDealDto } from './dto/deal.dto';
import { LiftLockDto } from './dto/lift-lock.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ApplyRemedyDto } from './dto/apply-remedy.dto';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/**
 * SUPER_ADMIN operator console (S2702 ratified design). Every route is an
 * owner intent; company-admin self-serve is never duplicated here (ruling 6).
 */
@ApiTags('Console')
@ApiBearerAuth()
@Controller('console')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class ConsoleController {
  constructor(private readonly consoleService: ConsoleService) {}

  private actor(req: AuthenticatedRequest): OperatorActor {
    return { userId: req.user.userId, email: req.user.email };
  }

  // ---- Overview -----------------------------------------------------------

  @Get('overview')
  @ApiOperation({ summary: 'Scoreboard: customers, per-currency MRR, tiles' })
  getOverview() {
    return this.consoleService.getOverview();
  }

  // ---- Payments rollup (declared before parameterized payment routes) -----

  @Get('payments/upcoming')
  @ApiOperation({
    summary: 'Manual payments due within the lookahead window; overdue first',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getUpcomingPayments(
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
  ) {
    return this.consoleService.getUpcomingManualPayments(days);
  }

  @Get('payments/:id/receipt')
  @ApiOperation({ summary: 'Stream a manual payment receipt image' })
  async getReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { stream, fileName, contentType } =
      await this.consoleService.getReceiptStream(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(res);
  }

  // ---- Companies ----------------------------------------------------------

  @Get('companies')
  @ApiOperation({
    summary: 'Operator companies list with rail/deal/lock state',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  listCompanies(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.consoleService.listCompanies(page, limit, search);
  }

  @Get('companies/:companyId')
  @ApiOperation({
    summary:
      'Company detail: live billing state, deal, lock state, admin user for Login-as',
  })
  getCompany(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.consoleService.getCompanyDetail(companyId);
  }

  @Get('companies/:companyId/history')
  @ApiOperation({ summary: 'Operator event log for the History tab' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCompanyHistory(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.consoleService.getCompanyHistory(companyId, page, limit);
  }

  // ---- Deals --------------------------------------------------------------

  @Post('companies/:companyId/deal')
  @ApiOperation({ summary: 'Give this company a deal' })
  @ApiBody({ type: GrantDealDto })
  grantDeal(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: GrantDealDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.grantDeal(companyId, dto, this.actor(req));
  }

  @Patch('companies/:companyId/deal')
  @ApiOperation({ summary: 'Edit the active deal (full re-statement)' })
  @ApiBody({ type: GrantDealDto })
  updateDeal(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: GrantDealDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.updateDeal(companyId, dto, this.actor(req));
  }

  @Post('companies/:companyId/deal/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the deal early (never locks; expiry locks)' })
  endDeal(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.endDeal(companyId, this.actor(req));
  }

  // ---- Lock lift ----------------------------------------------------------

  @Post('companies/:companyId/lift')
  @ApiOperation({
    summary: 'Lift the write lock until a date (let them breathe)',
  })
  @ApiBody({ type: LiftLockDto })
  liftLock(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: LiftLockDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.liftLock(companyId, dto, this.actor(req));
  }

  @Post('companies/:companyId/lift/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the lift now (the lock re-applies immediately)',
  })
  endLift(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.endLift(companyId, this.actor(req));
  }

  // ---- Manual payments ----------------------------------------------------

  @Get('companies/:companyId/payments')
  @ApiOperation({ summary: 'Manual payment ledger for a company' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPayments(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.consoleService.listPayments(companyId, page, limit);
  }

  @Post('companies/:companyId/payments')
  @ApiOperation({
    summary:
      'Record a manual payment (any currency, no FX). Notes or receipt required.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, _file, cb) => cb(null, randomUUID()),
      }),
      limits: { fileSize: MAX_RECEIPT_BYTES },
    }),
  )
  recordPayment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: RecordPaymentDto,
    @UploadedFile() receipt: Express.Multer.File | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.recordPayment(
      companyId,
      dto,
      receipt,
      this.actor(req),
    );
  }

  // ---- Make it right ------------------------------------------------------

  @Post('remedies')
  @ApiOperation({
    summary:
      'Make it right: next-bill discount (default) or refund, anchored to a paid payment',
  })
  @ApiBody({ type: ApplyRemedyDto })
  applyRemedy(
    @Body() dto: ApplyRemedyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.consoleService.applyRemedy(dto, this.actor(req));
  }

  // ---- System health ------------------------------------------------------

  @Get('system/price-health')
  @ApiOperation({
    summary:
      'Price catalogue status per row, provider errors verbatim; auto-syncs missing rows on read',
  })
  getPriceHealth() {
    return this.consoleService.getPriceHealth();
  }

  // ---- Marketers ----------------------------------------------------------

  @Get('reports/marketers')
  @ApiOperation({
    summary: 'MRR by marketer code (list price, per currency, no FX)',
  })
  getMarketersReport() {
    return this.consoleService.getMarketersReport();
  }
}
