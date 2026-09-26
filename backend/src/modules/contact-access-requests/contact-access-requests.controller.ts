import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '@shared/guards/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';
import { AuthenticatedRequest } from '@shared/interfaces/authenticated-request.interface';
import { requireCompanyId } from '@shared/utils/auth.util';
import {
  ContactAccessRequestView,
  ContactAccessRequestsService,
  resolveApprovalExpiry,
  serializeContactAccessRequest,
} from './contact-access-requests.service';
import { ContactAccessSourceType } from './entities/contact-access-request.entity';
import { CreateContactAccessRequestDto } from './dto/create-contact-access-request.dto';
import { QueryContactAccessRequestsDto } from './dto/query-contact-access-requests.dto';
import { ApproveContactAccessRequestDto } from './dto/approve-contact-access-request.dto';
import { DecideContactAccessRequestDto } from './dto/decide-contact-access-request.dto';

@ApiTags('contact-access-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contact-access-requests')
export class ContactAccessRequestsController {
  constructor(private readonly service: ContactAccessRequestsService) {}

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.COMPANY_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.AGENT,
    Role.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Ask for full access to a contact' })
  async create(
    @Body() dto: CreateContactAccessRequestDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ContactAccessRequestView> {
    const companyId = requireCompanyId(req.user);
    const row = await this.service.raiseRequest(
      companyId,
      dto.contactId,
      req.user.userId,
      { sourceType: ContactAccessSourceType.CONTACT, sourceId: dto.contactId },
      dto.note ?? null,
    );
    return serializeContactAccessRequest(
      await this.service.findOneForView(companyId, row.id),
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
    summary:
      'List access requests (approvers: their regions; others: their own)',
  })
  async findAll(
    @Query() query: QueryContactAccessRequestsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    data: ContactAccessRequestView[];
    total: number;
    page: number;
    limit: number;
  }> {
    const result = await this.service.findAll(
      requireCompanyId(req.user),
      req.user,
      {
        status: query.status,
        kind: query.kind,
        mine: query.mine,
        page: query.page,
        limit: query.limit,
      },
    );
    return { ...result, data: result.data.map(serializeContactAccessRequest) };
  }

  @Post(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary:
      'Approve a pending request (90 days by default, a date, or forever)',
  })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveContactAccessRequestDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ContactAccessRequestView> {
    const expiresAt = resolveApprovalExpiry(dto);
    return serializeContactAccessRequest(
      await this.service.approve(
        requireCompanyId(req.user),
        req.user,
        id,
        expiresAt,
      ),
    );
  }

  @Post(':id/reject')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Reject a pending request with a reason' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideContactAccessRequestDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ContactAccessRequestView> {
    return serializeContactAccessRequest(
      await this.service.reject(
        requireCompanyId(req.user),
        req.user,
        id,
        dto.reason,
      ),
    );
  }

  @Post(':id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Revoke an approved grant with a reason' })
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideContactAccessRequestDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ContactAccessRequestView> {
    return serializeContactAccessRequest(
      await this.service.revoke(
        requireCompanyId(req.user),
        req.user,
        id,
        dto.reason,
      ),
    );
  }
}
