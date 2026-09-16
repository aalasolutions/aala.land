import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  In,
  Not,
  IsNull,
  DataSource,
  EntityManager,
} from 'typeorm';
import { withCompanyLock } from '@shared/utils/company-lock.util';
import { User, AuthProvider } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { RemoveUserDto } from './dto/remove-user.dto';
import { TrimCompanyUsersDto } from './dto/trim-company-users.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { getRoleLevel } from '../../shared/utils/auth.util';
import { envString } from '../../shared/utils/env.util';
import { SystemEmailService } from '../email/system-email.service';
import { Role } from '../../shared/enums/roles.enum';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import { BillingService, SeatReservation } from '../billing/billing.service';
import { UserReassignmentService } from './reassignment/user-reassignment.service';
import { WhatsappSignupService } from '../whatsapp/whatsapp-signup.service';
import { WhatsappGateway } from '../whatsapp/whatsapp.gateway';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ReassignmentReport } from './reassignment/reassignment-report';
import { errorMessage } from '@shared/utils/error.util';
import {
  OwnershipTransferRecorder,
  OWNERSHIP_TRANSFER_RECORDER,
} from './reassignment/ownership-transfer-recorder';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';

/** Safety bound on the reassignment/trim picker list. Realistic teams are far smaller. */
const ACTIVE_MEMBERS_LIMIT = 500;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
    private readonly systemEmail: SystemEmailService,
    private readonly billingService: BillingService,
    private readonly reassignmentService: UserReassignmentService,
    private readonly whatsappSignupService: WhatsappSignupService,
    private readonly whatsappGateway: WhatsappGateway,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly recordHistoryService: RecordHistoryService,
    @Optional()
    @Inject(OWNERSHIP_TRANSFER_RECORDER)
    private readonly transferRecorder?: OwnershipTransferRecorder,
  ) {}

  async create(
    dto: CreateUserDto,
    companyId: string,
    requesterRole: Role,
  ): Promise<User> {
    if (dto.role) {
      const requesterLevel = getRoleLevel(requesterRole);
      const assignedLevel = getRoleLevel(dto.role);
      if (
        requesterRole !== Role.SUPER_ADMIN &&
        assignedLevel <= requesterLevel
      ) {
        throw new ForbiddenException(
          'You are only allowed to assign roles with lower privilege than your own',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Serializes cap-check/seat-reserve/save per company so two adds can't pass the same cap
    return withCompanyLock(this.dataSource, companyId, async (manager) => {
      const company = await this.enforceUserLimit(companyId, manager);

      const existing = await manager.findOne(User, {
        where: { email: dto.email, deletedAt: IsNull() },
      });
      if (existing) {
        throw new ConflictException('Email already exists');
      }

      // Held inside the lock so the live seat read and increment can't interleave
      const seat: SeatReservation | null = company
        ? await this.billingService.reserveSeat(company)
        : null;

      try {
        const { regionCodes, ...userFields } = dto;

        // Falls back to company default, then any active region; else scoping is escaped
        const codes = regionCodes?.length
          ? this.validateRegionCodes(regionCodes, company?.activeRegions ?? [])
          : this.fallbackRegionCodes(company);

        const user = manager.create(User, {
          ...userFields,
          password: hashedPassword,
          companyId,
          regionCodes: codes,
        });
        return await manager.save(user);
      } catch (err) {
        if (seat) await seat.release();
        throw err;
      }
    });
  }

  async findAll(
    companyId: string | null | undefined,
    page = 1,
    limit = 20,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const findOptions = {
      where: companyId
        ? { companyId, role: Not(Role.SUPER_ADMIN), deletedAt: IsNull() }
        : { deletedAt: IsNull() },
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' as const },
    };
    if (!companyId) {
      Object.assign(findOptions, { relations: ['company'] });
    }
    const [data, total] = await this.userRepository.findAndCount(findOptions);
    // Stored order is assignment order; its first element is the region scoping fallback
    const withRegions = data.map((user) => ({
      ...user,
      regionCodes: [...(user.regionCodes ?? [])].sort(),
    }));
    return { data: withRegions, total, page, limit };
  }

  private fallbackRegionCodes(
    company: {
      defaultRegionCode?: string | null;
      activeRegions?: string[] | null;
    } | null,
  ): string[] {
    if (company?.defaultRegionCode) return [company.defaultRegionCode];
    const first = company?.activeRegions?.[0];
    return first ? [first] : [];
  }

  private validateRegionCodes(
    regionCodes: string[],
    allowed: string[],
  ): string[] {
    const requested = [...new Set(regionCodes)];
    const invalid = requested.filter((code) => !allowed.includes(code));
    if (invalid.length) {
      throw new BadRequestException(
        `Not active for this company: ${invalid.join(', ')}`,
      );
    }
    return requested;
  }

  // Replaces regions wholesale; codes outside active regions are rejected, not dropped
  async setRegions(
    id: string,
    companyId: string | undefined,
    regionCodes: string[],
  ): Promise<{ id: string; regionCodes: string[] }> {
    const user = await this.findOne(id, companyId);

    // No company means no active region list to validate against.
    if (!user.companyId) {
      throw new BadRequestException('User is not associated with a company');
    }

    const company = await this.companyRepository.findOne({
      where: { id: user.companyId },
      select: { activeRegions: true },
    });
    const allowed = company?.activeRegions ?? [];

    const requested = this.validateRegionCodes(regionCodes, allowed);

    await this.userRepository.update(user.id, { regionCodes: requested });

    return { id: user.id, regionCodes: [...requested].sort() };
  }

  async findOne(id: string, companyId: string | undefined): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull(), ...(companyId ? { companyId } : {}) },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByIdWithCompany(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['company'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email, deletedAt: IsNull() },
      select: [
        'id',
        'email',
        'password',
        'name',
        'role',
        'companyId',
        'googleId',
        'authProvider',
        'isActive',
      ],
    });
  }

  async findByIdForAuth(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
      select: [
        'id',
        'email',
        'password',
        'name',
        'role',
        'companyId',
        'googleId',
        'authProvider',
        'isActive',
      ],
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { googleId, deletedAt: IsNull() },
      select: [
        'id',
        'email',
        'password',
        'name',
        'role',
        'companyId',
        'googleId',
        'authProvider',
        'isActive',
      ],
    });
  }

  async findByEmailOrGoogleId(
    email: string,
    googleId: string,
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: [
        { email, deletedAt: IsNull() },
        { googleId, deletedAt: IsNull() },
      ],
      select: [
        'id',
        'email',
        'password',
        'name',
        'role',
        'companyId',
        'googleId',
        'authProvider',
        'isActive',
      ],
    });
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await this.userRepository.update(userId, {
      googleId,
      authProvider: AuthProvider.GOOGLE,
    });
  }

  async update(
    targetUserId: string,
    companyId: string | undefined,
    dto: UpdateUserDto,
    requesterRole: string,
    requesterId: string,
  ): Promise<User> {
    const requesterLevel = getRoleLevel(requesterRole as Role);

    const user = await this.userRepository.findOne({
      where: {
        id: targetUserId,
        deletedAt: IsNull(),
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetLevel = getRoleLevel(user.role as Role);
    const isSelfUpdate = targetUserId === requesterId;

    if (
      !isSelfUpdate &&
      requesterRole !== Role.SUPER_ADMIN &&
      targetLevel <= requesterLevel
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this user',
      );
    }

    const updates: Partial<User> = { ...dto };

    if (updates.role) {
      if (isSelfUpdate) {
        throw new ForbiddenException('You cannot change your own role');
      }

      const newRoleLevel = getRoleLevel(updates.role);

      if (
        requesterRole !== Role.SUPER_ADMIN &&
        newRoleLevel <= requesterLevel
      ) {
        throw new ForbiddenException(
          'You are only allowed to assign roles with lower privilege than your own',
        );
      }
    }

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }

    Object.assign(user, updates);

    return this.userRepository.save(user);
  }

  // Runs inside one locked transaction with FOR-UPDATE reloads so no stale pre-check slips through

  private isPaidTier(company: Company): boolean {
    return company.subscriptionTier !== SubscriptionTier.FREE;
  }

  /** Requester's company when scoped, target's for SUPER_ADMIN; null lets validation run. */
  private async resolveRemovalLockCompanyId(
    targetUserId: string,
    requesterCompanyId: string | undefined,
  ): Promise<string | null> {
    if (requesterCompanyId) return requesterCompanyId;
    const target = await this.userRepository.findOne({
      where: { id: targetUserId, deletedAt: IsNull() },
      select: ['id', 'companyId'],
    });
    return target?.companyId ?? null;
  }

  /** Shared deactivate/delete validation; runs locked with FOR-UPDATE for current state. */
  private async loadRemovalContext(
    manager: EntityManager,
    targetUserId: string,
    requesterId: string,
    requesterCompanyId: string | undefined,
    requesterRole: Role,
    dto: RemoveUserDto,
    options: { requireActiveTarget: boolean },
  ): Promise<{ target: User; reassignee: User; company: Company }> {
    if (targetUserId === requesterId) {
      throw new BadRequestException('You cannot remove your own account');
    }
    if (targetUserId === dto.reassignToUserId) {
      throw new BadRequestException(
        'The reassignment target must be a different user',
      );
    }

    const target = await manager.findOne(User, {
      where: {
        id: targetUserId,
        deletedAt: IsNull(),
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      },
      lock: { mode: 'for_no_key_update' },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (options.requireActiveTarget && !target.isActive) {
      throw new BadRequestException('User is already inactive');
    }
    if (!target.companyId) {
      throw new BadRequestException(
        'Users without a company cannot be removed through this flow',
      );
    }

    const requesterLevel = getRoleLevel(requesterRole);
    const targetLevel = getRoleLevel(target.role);
    if (targetLevel <= requesterLevel && requesterRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'You do not have permission to remove this user',
      );
    }

    // Guards against a concurrent deactivate of the recipient landing records on it
    const reassignee = await manager.findOne(User, {
      where: {
        id: dto.reassignToUserId,
        companyId: target.companyId,
        isActive: true,
        deletedAt: IsNull(),
      },
      lock: { mode: 'for_no_key_update' },
    });
    if (!reassignee) {
      throw new NotFoundException(
        'Reassignment target not found, inactive, or in a different company',
      );
    }

    const company = await manager.findOne(Company, {
      where: { id: target.companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${target.companyId} not found`);
    }

    return { target, reassignee, company };
  }

  /** Deactivates with reassignment and a seat -1 on paid plans; row and history survive. */
  async deactivateUser(
    targetUserId: string,
    requesterId: string,
    requesterCompanyId: string | undefined,
    requesterRole: Role,
    dto: RemoveUserDto,
  ): Promise<ReassignmentReport> {
    const lockCompanyId = await this.resolveRemovalLockCompanyId(
      targetUserId,
      requesterCompanyId,
    );
    const report = await this.runRemoval(lockCompanyId, async (manager) => {
      const { target, reassignee, company } = await this.loadRemovalContext(
        manager,
        targetUserId,
        requesterId,
        requesterCompanyId,
        requesterRole,
        dto,
        { requireActiveTarget: true },
      );

      // Seat -1 inside the lock, derived from the live provider quantity.
      const seat = await this.billingService.decrementSeat(company);

      try {
        await manager.update(User, target.id, { isActive: false });
        await this.recordUserHistory(
          manager,
          company.id,
          target,
          RecordHistoryAction.DEACTIVATE,
          requesterId,
          dto.reason,
          { reassignToUserId: reassignee.id },
        );
        const report = await this.reassignmentService.reassignOwnedRecords(
          manager,
          company.id,
          target.id,
          reassignee.id,
          dto.reason,
          { collectIds: !!this.transferRecorder },
        );
        if (this.transferRecorder) {
          await this.transferRecorder.record(manager, company.id, report);
        }
        return report;
      } catch (err) {
        if (seat) await seat.compensate();
        throw err;
      }
    });

    await this.disconnectWhatsappAfterRemoval(lockCompanyId, report);
    return report;
  }

  async softDeleteUserWithReassignment(
    targetUserId: string,
    requesterId: string,
    requesterCompanyId: string | undefined,
    requesterRole: Role,
    dto: RemoveUserDto,
  ): Promise<ReassignmentReport> {
    const lockCompanyId = await this.resolveRemovalLockCompanyId(
      targetUserId,
      requesterCompanyId,
    );
    const report = await this.runRemoval(lockCompanyId, async (manager) => {
      const { target, reassignee, company } = await this.loadRemovalContext(
        manager,
        targetUserId,
        requesterId,
        requesterCompanyId,
        requesterRole,
        dto,
        { requireActiveTarget: false },
      );

      const seat = target.isActive
        ? await this.billingService.decrementSeat(company)
        : null;

      try {
        await manager.update(User, target.id, {
          isActive: false,
          deletedAt: new Date(),
          googleId: null,
          password: null,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        });
        await this.recordUserHistory(
          manager,
          company.id,
          target,
          RecordHistoryAction.DELETE,
          requesterId,
          dto.reason,
          { reassignToUserId: reassignee.id },
        );
        const report = await this.reassignmentService.reassignOwnedRecords(
          manager,
          company.id,
          target.id,
          reassignee.id,
          dto.reason,
          { collectIds: !!this.transferRecorder },
        );
        if (this.transferRecorder) {
          await this.transferRecorder.record(manager, company.id, report);
        }
        return report;
      } catch (err) {
        if (seat) await seat.compensate();
        throw err;
      }
    });

    await this.disconnectWhatsappAfterRemoval(lockCompanyId, report);
    return report;
  }

  // Server-initiated disconnect is not recoverable, so no session is saved for replay.
  private disconnectLiveSockets(userId: string): void {
    for (const gateway of [this.whatsappGateway, this.notificationsGateway]) {
      try {
        gateway.disconnectUser(userId);
      } catch (err) {
        this.logger.error(
          `Live sockets not disconnected for removed user ${userId}`,
          errorMessage(err),
        );
      }
    }
  }

  // Disconnects the seat outside the lock and stops Meta webhooks; chats stay with the agent.
  private async disconnectWhatsappAfterRemoval(
    companyId: string | null,
    report: ReassignmentReport,
  ): Promise<void> {
    this.disconnectLiveSockets(report.fromUserId);
    if (!companyId) return;
    try {
      await this.whatsappSignupService.disconnect(
        report.fromUserId,
        companyId,
        'SEAT_REMOVED',
      );
    } catch (err) {
      this.logger.error(
        `WhatsApp session not torn down for removed user ${report.fromUserId} in company ${companyId}; it may keep receiving and spending AI credits`,
        errorMessage(err),
      );
    }
  }

  /** Deactivates all but keepUserId; re-reads counts locked so a concurrent add can't slip past. */
  async trimToOneActiveUser(
    companyId: string,
    requesterId: string,
    dto: TrimCompanyUsersDto,
  ): Promise<{ deactivatedCount: number; reports: ReassignmentReport[] }> {
    const result = await withCompanyLock(
      this.dataSource,
      companyId,
      async (manager) => {
        const keeper = await manager.findOne(User, {
          where: { id: dto.keepUserId, companyId, isActive: true },
          lock: { mode: 'for_no_key_update' },
        });
        if (!keeper) {
          throw new NotFoundException(
            'The user to keep was not found or is inactive',
          );
        }
        if (keeper.role !== Role.COMPANY_ADMIN) {
          throw new BadRequestException(
            'The remaining user must be a company admin so the account can still be managed',
          );
        }

        const company = await manager.findOne(Company, {
          where: { id: companyId },
        });
        if (!company) {
          throw new NotFoundException(`Company ${companyId} not found`);
        }

        const others = await manager.find(User, {
          where: { companyId, isActive: true, id: Not(dto.keepUserId) },
          order: { createdAt: 'ASC' },
          lock: { mode: 'for_no_key_update' },
        });
        if (others.length === 0) {
          return { deactivatedCount: 0, reports: [] };
        }

        // ENTERPRISE's base plan covers the keeper at 0 extra seats, PRO bills 1
        let compensate: (() => Promise<void>) | null = null;
        if (
          this.isPaidTier(company) &&
          company.billingSubscriptionId &&
          company.billingCustomerId
        ) {
          const previous =
            await this.billingService.getLiveSeatQuantity(company);
          const trimmedSeats =
            company.subscriptionTier === SubscriptionTier.ENTERPRISE ? 0 : 1;
          await this.billingService.setSeatQuantity(company, trimmedSeats);
          compensate = async () => {
            try {
              await this.billingService.setSeatQuantity(company, previous);
            } catch (err) {
              this.logger.error(
                `Trim seat compensation to ${previous} failed for company ${company.id}: ${errorMessage(err)}`,
              );
            }
          };
        }

        try {
          const actorName = await this.recordHistoryService.resolveActorName(
            manager,
            requesterId,
          );
          const collected: ReassignmentReport[] = [];
          for (const user of others) {
            await manager.update(User, user.id, { isActive: false });
            await this.recordUserHistory(
              manager,
              companyId,
              user,
              RecordHistoryAction.DEACTIVATE,
              requesterId,
              dto.reason,
              { reassignToUserId: keeper.id },
              actorName,
            );
            const report = await this.reassignmentService.reassignOwnedRecords(
              manager,
              companyId,
              user.id,
              keeper.id,
              dto.reason,
              { collectIds: !!this.transferRecorder },
            );
            if (this.transferRecorder) {
              await this.transferRecorder.record(manager, companyId, report);
            }
            collected.push(report);
          }

          // Backstop: rolls back if more than one active user remains before commit
          const remainingActive = await manager.count(User, {
            where: { companyId, isActive: true },
          });
          if (remainingActive > 1) {
            throw new ConflictException(
              'Another active user was added while trimming; please retry the downgrade.',
            );
          }

          this.logger.log(
            `Trimmed company ${companyId} to one active user (${keeper.id}) on request of ${requesterId}; deactivated ${others.length}`,
          );
          return { deactivatedCount: others.length, reports: collected };
        } catch (err) {
          if (compensate) await compensate();
          throw err;
        }
      },
    );

    // Runs outside the lock, like the other removal paths, since this table is unbounded
    for (const report of result.reports) {
      await this.disconnectWhatsappAfterRemoval(companyId, report);
    }
    return result;
  }

  /** Mirrors deactivateUser: seat +1 on paid, FREE gated by active-user cap, both locked. */
  async reactivateUser(
    targetUserId: string,
    requesterCompanyId: string | undefined,
    requesterRole: Role,
    requesterId: string,
    reason?: string,
  ): Promise<User> {
    const lockCompanyId = await this.resolveRemovalLockCompanyId(
      targetUserId,
      requesterCompanyId,
    );
    return this.runRemoval(lockCompanyId, async (manager) => {
      const target = await manager.findOne(User, {
        where: {
          id: targetUserId,
          deletedAt: IsNull(),
          ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
        },
        lock: { mode: 'for_no_key_update' },
      });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      if (target.isActive) {
        throw new BadRequestException('User is already active');
      }
      if (!target.companyId) {
        throw new BadRequestException(
          'Users without a company cannot be reactivated through this flow',
        );
      }

      const requesterLevel = getRoleLevel(requesterRole);
      const targetLevel = getRoleLevel(target.role);
      if (targetLevel <= requesterLevel && requesterRole !== Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          'You do not have permission to reactivate this user',
        );
      }

      const company = await manager.findOne(Company, {
        where: { id: target.companyId },
      });
      if (!company) {
        throw new NotFoundException(`Company ${target.companyId} not found`);
      }

      // FREE tiers gated by the active-user cap, counted inside the lock to avoid a race
      let compensate: (() => Promise<void>) | null = null;
      if (
        this.isPaidTier(company) &&
        company.billingSubscriptionId &&
        company.billingCustomerId
      ) {
        const previous = await this.billingService.getLiveSeatQuantity(company);
        await this.billingService.setSeatQuantity(company, previous + 1);
        compensate = async () => {
          try {
            await this.billingService.setSeatQuantity(company, previous);
          } catch (err) {
            this.logger.error(
              `Reactivation seat compensation failed for company ${company.id}: ${errorMessage(err)}`,
            );
          }
        };
      } else if (!this.isPaidTier(company)) {
        const activeCount = await manager.count(User, {
          where: { companyId: target.companyId, isActive: true },
        });
        if (activeCount >= company.maxUsers) {
          throw new BadRequestException(
            `Your ${company.subscriptionTier} plan allows up to ${company.maxUsers} active user${company.maxUsers === 1 ? '' : 's'}. Upgrade to reactivate.`,
          );
        }
      }

      try {
        await manager.update(User, target.id, { isActive: true });
        await this.recordUserHistory(
          manager,
          company.id,
          target,
          RecordHistoryAction.REACTIVATE,
          requesterId,
          reason,
        );
      } catch (err) {
        if (compensate) await compensate();
        throw err;
      }
      const refreshed = await manager.findOne(User, {
        where: { id: target.id },
      });
      if (!refreshed) {
        throw new NotFoundException('User not found');
      }
      return refreshed;
    });
  }

  private async recordUserHistory(
    manager: EntityManager,
    companyId: string,
    target: User,
    action: RecordHistoryAction,
    requesterId: string,
    reason?: string | null,
    metadata?: Record<string, unknown>,
    actorName?: string,
  ): Promise<void> {
    await this.recordHistoryService.record(manager, {
      companyId,
      action,
      entityType: 'User',
      entityId: target.id,
      entityTitle: target.name?.trim() || target.email,
      reason: reason ?? null,
      actorId: requesterId,
      actorName:
        actorName ??
        (await this.recordHistoryService.resolveActorName(
          manager,
          requesterId,
        )),
      regionCode: null,
      metadata: metadata ?? null,
    });
  }

  /** Runs under the company lock, or without one so validation still throws the right error. */
  private runRemoval<T>(
    lockCompanyId: string | null,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (lockCompanyId) {
      return withCompanyLock(this.dataSource, lockCompanyId, fn);
    }
    return this.dataSource.transaction(fn);
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { resetPasswordToken: token },
      select: ['id', 'email', 'resetPasswordToken', 'resetPasswordExpires'],
    });
  }

  async updateResetToken(
    userId: string,
    token: string | null,
    expires: Date | null,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.userRepository.update(userId, { password: hashedPassword });
  }

  async findAgents(companyId: string | undefined): Promise<User[]> {
    const assignableRoles = In([Role.AGENT, Role.COMPANY_ADMIN]);
    return this.userRepository.find({
      where: companyId
        ? { companyId, role: assignableRoles, isActive: true }
        : { role: assignableRoles, isActive: true },
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
    });
  }

  /** Active non-super-admin members for reassignment/trim pickers; capped at 500. */
  async findActiveMembers(companyId: string | undefined): Promise<User[]> {
    return this.userRepository.find({
      where: companyId
        ? { companyId, isActive: true, role: Not(Role.SUPER_ADMIN) }
        : { isActive: true, role: Not(Role.SUPER_ADMIN) },
      select: ['id', 'name', 'email', 'role', 'companyId'],
      order: { name: 'ASC' },
      take: ACTIVE_MEMBERS_LIMIT,
    });
  }

  async findAdmins(companyId: string): Promise<User[]> {
    return this.userRepository.find({
      where: {
        companyId,
        role: In([Role.COMPANY_ADMIN, Role.SUPER_ADMIN]),
        isActive: true,
      },
      select: ['id', 'name', 'email', 'role'],
    });
  }

  async inviteUser(
    companyId: string,
    dto: InviteUserDto,
    requesterRole: Role,
  ): Promise<User> {
    if (dto.role) {
      const requesterLevel = getRoleLevel(requesterRole);
      const assignedLevel = getRoleLevel(dto.role);
      if (
        requesterRole !== Role.SUPER_ADMIN &&
        assignedLevel <= requesterLevel
      ) {
        throw new ForbiddenException(
          'You are only allowed to assign roles with lower privilege than your own',
        );
      }
    }

    const placeholderPassword = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      12,
    );
    const name = `${dto.firstName} ${dto.lastName}`;

    // Token generation and invite email run after the lock so a failure can't release a billed seat
    const saved: User = await withCompanyLock(
      this.dataSource,
      companyId,
      async (manager) => {
        const company = await this.enforceUserLimit(companyId, manager);

        const existing = await manager.findOne(User, {
          where: { email: dto.email, deletedAt: IsNull() },
        });
        if (existing) {
          if (!existing.isActive && existing.companyId === companyId) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message: `${existing.name} is already in the system as an inactive user. Reactivate them instead of sending a new invite.`,
              code: 'EMAIL_INACTIVE_USER',
              existingUserId: existing.id,
              existingUserName: existing.name,
            });
          }
          throw new ConflictException('Email already exists');
        }

        const user = manager.create(User, {
          name,
          email: dto.email,
          password: placeholderPassword,
          role: dto.role,
          companyId,
          mustChangePassword: true,
          regionCodes: this.fallbackRegionCodes(company),
        });

        const seat: SeatReservation | null = company
          ? await this.billingService.reserveSeat(company)
          : null;

        try {
          return await manager.save(user);
        } catch (err) {
          if (seat) await seat.release();
          throw err;
        }
      },
    );

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await this.updateResetToken(saved.id, inviteToken, inviteExpires);

    this.sendInviteEmail(
      companyId,
      dto.email,
      dto.role ?? '',
      name,
      inviteToken,
    ).catch((err) => {
      this.logger.error(
        `Failed to send invite email to ${dto.email}: ${errorMessage(err)}`,
      );
    });

    return saved;
  }

  /** Caps FREE/no-sub companies; subscribed ones bill per seat. Pass the locked manager. */
  private async enforceUserLimit(
    companyId: string | undefined,
    manager: EntityManager,
  ): Promise<Company | null> {
    if (!companyId) return null;
    const company = await manager.findOne(Company, {
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }
    // Subscription-backed paid plan: the provider seat gate governs, no column cap.
    if (
      company.subscriptionTier !== SubscriptionTier.FREE &&
      company.billingSubscriptionId &&
      company.billingCustomerId
    ) {
      return company;
    }
    const currentCount = await manager.count(User, {
      where: { companyId, isActive: true },
    });
    if (currentCount >= company.maxUsers) {
      const label =
        company.subscriptionTier === SubscriptionTier.FREE
          ? `Your FREE plan allows up to ${company.maxUsers} user${company.maxUsers === 1 ? '' : 's'}. Upgrade to Pro to add team members.`
          : `Your plan allows up to ${company.maxUsers} user${company.maxUsers === 1 ? '' : 's'}. Contact us to extend your arrangement.`;
      throw new BadRequestException(label);
    }
    return company;
  }

  private async sendInviteEmail(
    companyId: string,
    email: string,
    role: string,
    name: string,
    inviteToken: string,
  ): Promise<void> {
    // Account email, not tenant CRM outreach, so it always uses the fixed system template
    const appUrl = envString('APP_URL', 'http://localhost:4200').replace(
      /\/$/,
      '',
    );
    const inviteUrl = `${appUrl}/accept-invite?token=${inviteToken}`;
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'name'],
    });
    await this.systemEmail.sendInvite(
      { email, name },
      role,
      company?.name ?? 'your team',
      inviteUrl,
    );
  }
}
