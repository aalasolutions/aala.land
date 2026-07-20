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
import { Repository, In, Not, DataSource, EntityManager } from 'typeorm';
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
import { MailService } from '../../shared/services/mail.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { EmailTemplateCategory } from '../email-templates/entities/email-template.entity';
import { Role } from '../../shared/enums/roles.enum';
import {
  Company,
  SubscriptionTier,
} from '../companies/entities/company.entity';
import {
  Commission,
  CommissionStatus,
} from '../commissions/entities/commission.entity';
import { BillingService, SeatReservation } from '../billing/billing.service';
import { UserReassignmentService } from './reassignment/user-reassignment.service';
import { ReassignmentReport } from './reassignment/reassignment-report';
import {
  OwnershipTransferRecorder,
  OWNERSHIP_TRANSFER_RECORDER,
} from './reassignment/ownership-transfer-recorder';

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
    private readonly mailService: MailService,
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly billingService: BillingService,
    private readonly reassignmentService: UserReassignmentService,
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

    // Serialize the whole cap-check -> seat-reserve -> save critical section per
    // company (race audit 2026-07-07, P1/P2): otherwise two concurrent adds both
    // pass the FREE cap or both derive the same seat quantity. The email UNIQUE
    // index is the DB backstop for the email dup; the advisory lock is the
    // backstop for the active-user count and the seat counter.
    return withCompanyLock(this.dataSource, companyId, async (manager) => {
      const company = await this.enforceUserLimit(companyId, manager);

      const existing = await manager.findOne(User, {
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already exists');
      }

      // Provider-first seat gate (contract section 9), now inside the held lock so
      // the live seat quantity read + increment cannot interleave with another add.
      const seat: SeatReservation | null = company
        ? await this.billingService.reserveSeat(company)
        : null;

      try {
        const user = manager.create(User, {
          ...dto,
          password: hashedPassword,
          companyId,
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
      where: companyId ? { companyId, role: Not(Role.SUPER_ADMIN) } : {},
      ...paginationOptions(page, limit),
      order: { createdAt: 'DESC' as const },
    };
    if (!companyId) {
      Object.assign(findOptions, { relations: ['company'] });
    }
    const [data, total] = await this.userRepository.findAndCount(findOptions);
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string | undefined): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, ...(companyId ? { companyId } : {}) },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByIdWithCompany(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['company'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
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
      where: { id },
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
      where: { googleId },
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
      where: [{ email }, { googleId }],
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
      where: { id: targetUserId, ...(companyId ? { companyId } : {}) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const targetLevel = getRoleLevel(user.role as Role);
    const isSelfUpdate = targetUserId === requesterId;

    // 🔒 Prevent unauthorized updates (except SUPER_ADMIN override and self-updates)
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

    // 🔒 Role change validation
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

    // 🔐 Password hashing
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }

    Object.assign(user, updates);

    return this.userRepository.save(user);
  }

  // ------------------------------------------------------------------
  // Removal lifecycle helpers (billing unit 5)
  //
  // CONCURRENCY (race audit 2026-07-07, P1/P3): every removal below runs its
  // validation, seat mutation, and local writes inside ONE withCompanyLock
  // transaction. The target and reassignee are re-loaded FOR UPDATE inside that
  // transaction, and the delete's non-PENDING commission count is re-checked
  // there too, so a commission that flips PENDING->APPROVED mid-flight, or a
  // concurrent deactivate of the reassignee, cannot slip past a stale pre-check.
  // The seat provider call is issued inside the held lock and derives its target
  // from the LIVE provider quantity (billing.decrementSeat / setSeatQuantity),
  // never from the lagged purchasedSeats. purchasedSeats itself is written only
  // by the unit 2 webhook.
  // ------------------------------------------------------------------

  private isPaidTier(company: Company): boolean {
    return company.subscriptionTier !== SubscriptionTier.FREE;
  }

  /**
   * True when the error is a Postgres foreign-key violation (SQLSTATE 23503).
   * TypeORM wraps the pg error in a QueryFailedError whose `code`/`driverError.code`
   * carries the SQLSTATE, so check both shapes.
   */
  private isForeignKeyViolation(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as { code?: string; driverError?: { code?: string } };
    return e.code === '23503' || e.driverError?.code === '23503';
  }

  /**
   * Resolve the companyId to lock on. For a company-scoped requester it is the
   * requester's own company; for SUPER_ADMIN (no company context) it is the
   * target user's company, resolved with a cheap immutable read. Returns null
   * only when the target does not exist or carries no company, in which case the
   * caller runs its validation without a lock to surface the correct error.
   */
  private async resolveRemovalLockCompanyId(
    targetUserId: string,
    requesterCompanyId: string | undefined,
  ): Promise<string | null> {
    if (requesterCompanyId) return requesterCompanyId;
    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
      select: ['id', 'companyId'],
    });
    return target?.companyId ?? null;
  }

  /**
   * Shared validation for deactivate and delete, run INSIDE the locked
   * transaction. Re-loads the target and reassignee FOR UPDATE so their state
   * (isActive, company, role) is the state at write time, and enforces self,
   * company-scope, and role-hierarchy rules.
   */
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
        ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
      },
      lock: { mode: 'pessimistic_write' },
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

    // Re-load + lock the reassignee inside the txn and assert it is still
    // active, so a concurrent deactivate of the recipient cannot land records
    // on an inactive user (race audit P3).
    const reassignee = await manager.findOne(User, {
      where: {
        id: dto.reassignToUserId,
        companyId: target.companyId,
        isActive: true,
      },
      lock: { mode: 'pessimistic_write' },
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

  /**
   * Deactivate: isActive false + reassignment + seat -1 on paid plans.
   * The user row, its history, and its financial records survive.
   * Returns the ReassignmentReport (persisted later by ownership-transfer-logs).
   */
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
    return this.runRemoval(lockCompanyId, async (manager) => {
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
  }

  /**
   * Permanent delete: reassignment + housekeeping + row removal + seat -1.
   * Blocked (409) when the user carries non PENDING commissions; those are
   * financial records whose agent attribution must survive, so the user can
   * only be deactivated. The commissions.agent_id NOT NULL FK is the
   * database backstop for the same rule.
   */
  async deleteUserWithReassignment(
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
    return this.runRemoval(lockCompanyId, async (manager) => {
      const { target, reassignee, company } = await this.loadRemovalContext(
        manager,
        targetUserId,
        requesterId,
        requesterCompanyId,
        requesterRole,
        dto,
        { requireActiveTarget: false },
      );

      // Re-check the non-PENDING commission block INSIDE the locked txn: a
      // commission that flipped PENDING->APPROVED (or a new one) after any
      // earlier read would otherwise keep agent_id pointing at the deleted
      // user (race audit P3). Counted on the txn manager for consistency.
      const lockedCommissions = await manager.getRepository(Commission).count({
        where: {
          agentId: target.id,
          companyId: company.id,
          status: Not(CommissionStatus.PENDING),
        },
      });
      if (lockedCommissions > 0) {
        throw new ConflictException(
          `This user has ${lockedCommissions} approved, paid, or cancelled commission record${lockedCommissions === 1 ? '' : 's'} that must keep their agent attribution. Deactivate the user instead.`,
        );
      }

      // Seat -1 only if the user still occupies a seat. Deleting an already
      // deactivated user must not decrement a second time (the deactivation
      // already did).
      const seat = target.isActive
        ? await this.billingService.decrementSeat(company)
        : null;

      try {
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

        // Housekeeping, deliberately OUTSIDE the frozen report enum:
        // 1. email_templates.created_by is authorship metadata with no FK;
        //    null it rather than leave a dangling uuid. Raw SQL because the
        //    entity property is typed as plain string.
        await manager.query(
          `UPDATE "email_templates" SET "created_by" = NULL WHERE "created_by" = $1 AND "company_id" = $2`,
          [target.id, company.id],
        );
        // 2. The user's personal notification inbox is unreachable once the
        //    row is gone; notifications.user_id is NOT NULL with no FK.
        await manager.query(
          `DELETE FROM "notifications" WHERE "user_id" = $1`,
          [target.id],
        );

        // lead_activities.performed_by and audit_logs.user_id are handled by
        // the database itself (ON DELETE SET NULL, migration 1779500000041).
        // leads.previous_agent is a plain history column and stays as is.
        //
        // commissions.agent_id is a NOT NULL FK with ON DELETE RESTRICT
        // (migration 1779500000045). The in-txn non-PENDING count above is
        // the fast path, but a commission that flipped PENDING->APPROVED
        // between that count and this delete would still reference the user;
        // the FK then raises 23503, which we surface as a clean 409 rather
        // than a raw 500. The whole txn (including the isActive/reassignment
        // writes) rolls back, so nothing is orphaned.
        try {
          await manager.delete(User, { id: target.id });
        } catch (err) {
          if (this.isForeignKeyViolation(err)) {
            throw new ConflictException(
              'This user still has records that reference them (for example commissions) and cannot be deleted; deactivate instead.',
            );
          }
          throw err;
        }

        return report;
      } catch (err) {
        if (seat) await seat.compensate();
        throw err;
      }
    });
  }

  /**
   * Downgrade preparation: deactivate every active user except keepUserId
   * and reassign all their records to that user, in one locked transaction.
   * This is what satisfies the unit 3 downgrade-to-Free gate (409 until exactly
   * one active user remains).
   *
   * Provider handling: one call setting the seat quantity to 1, only when the
   * company is a paid tier WITH a live subscription. A comp account (paid tier,
   * no subscription) skips the provider call and trims freely (owner decision
   * 2026-07-07, Option B). Post external-cancel companies are already FREE
   * (contract section 8) and take the FREE branch.
   *
   * The keeper, the "others" set, and the final active-count are all read
   * inside the lock, so a user created or invited mid-trim (which takes the
   * same company lock) cannot survive undetected and break the one-active-user
   * invariant (race audit P3).
   */
  async trimToOneActiveUser(
    companyId: string,
    requesterId: string,
    dto: TrimCompanyUsersDto,
  ): Promise<{ deactivatedCount: number; reports: ReassignmentReport[] }> {
    return withCompanyLock(this.dataSource, companyId, async (manager) => {
      const keeper = await manager.findOne(User, {
        where: { id: dto.keepUserId, companyId, isActive: true },
        lock: { mode: 'pessimistic_write' },
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
        lock: { mode: 'pessimistic_write' },
      });
      if (others.length === 0) {
        return { deactivatedCount: 0, reports: [] };
      }

      // Seat line -> the target for a single remaining user, inside the lock.
      // ENTERPRISE's $250 base covers that keeper (0 extra seats); PRO bills it
      // (1 seat). Comp accounts with no subscription skip it.
      let compensate: (() => Promise<void>) | null = null;
      if (
        this.isPaidTier(company) &&
        company.billingSubscriptionId &&
        company.billingCustomerId
      ) {
        const previous = await this.billingService.getLiveSeatQuantity(company);
        const trimmedSeats =
          company.subscriptionTier === SubscriptionTier.ENTERPRISE ? 0 : 1;
        await this.billingService.setSeatQuantity(company, trimmedSeats);
        compensate = async () => {
          try {
            await this.billingService.setSeatQuantity(company, previous);
          } catch (err) {
            this.logger.error(
              `Trim seat compensation to ${previous} failed for company ${company.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        };
      }

      try {
        const collected: ReassignmentReport[] = [];
        for (const user of others) {
          await manager.update(User, user.id, { isActive: false });
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

        // Backstop: confirm exactly one active user remains before commit.
        // Anything else means a concurrent add slipped in (should be
        // impossible under the shared lock) and the downgrade invariant
        // would be broken, so abort and roll back.
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
    });
  }

  /**
   * Reactivate a deactivated user. Mirror of deactivateUser: on paid plans
   * the provider seat +1 happens inside the lock (derived from the live
   * quantity) before the local write; FREE plans are gated by the same
   * active-user cap as create and invite, counted inside the lock.
   */
  async reactivateUser(
    targetUserId: string,
    requesterCompanyId: string | undefined,
    requesterRole: Role,
  ): Promise<User> {
    const lockCompanyId = await this.resolveRemovalLockCompanyId(
      targetUserId,
      requesterCompanyId,
    );
    return this.runRemoval(lockCompanyId, async (manager) => {
      const target = await manager.findOne(User, {
        where: {
          id: targetUserId,
          ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}),
        },
        lock: { mode: 'pessimistic_write' },
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

      // Provider seat +1 (live-derived) on a paid tier WITH a live
      // subscription; comp accounts (paid tier, no subscription) skip it
      // (Option B). FREE tiers are gated by the active-user cap, counted
      // inside the lock so it cannot race a concurrent add/reactivate.
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
              `Reactivation seat compensation failed for company ${company.id}: ${err instanceof Error ? err.message : String(err)}`,
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

  /**
   * Run a single-target removal/reactivation critical section under the company
   * advisory lock. When the lock company could not be resolved (target missing
   * or company-less), run without the advisory lock so the inner validation
   * still throws the correct NotFound/BadRequest; a FOR UPDATE row lock inside
   * the transaction still applies in that path.
   */
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
    return this.userRepository.find({
      where: companyId
        ? { companyId, role: Role.AGENT, isActive: true }
        : { role: Role.AGENT, isActive: true },
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
    });
  }

  /**
   * Active, non-super-admin members of a company, for the reassignment and trim
   * pickers. Filtering by isActive and company on the SERVER means the pickers never
   * miss a valid candidate the way a client-side filter over a single /users page
   * could (a company with many inactive users, or a SUPER_ADMIN viewing one company).
   * Capped at 500 as a safety bound.
   */
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

    // Same serialized cap-check -> seat-reserve -> save section as create()
    // (race audit 2026-07-07, P1/P2). Token generation and the invite email run
    // AFTER the lock: once the row exists the billed seat correctly mirrors a real
    // user, so a later token or email failure must NOT release the seat.
    const saved: User = await withCompanyLock(
      this.dataSource,
      companyId,
      async (manager) => {
        const company = await this.enforceUserLimit(companyId, manager);

        const existing = await manager.findOne(User, {
          where: { email: dto.email },
        });
        if (existing) {
          throw new ConflictException('Email already exists');
        }

        const user = manager.create(User, {
          name,
          email: dto.email,
          password: placeholderPassword,
          role: dto.role,
          companyId,
          mustChangePassword: true,
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
        `Failed to send invite email to ${dto.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return saved;
  }

  /**
   * The maxUsers COLUMN caps FREE companies and paid companies WITHOUT a live
   * subscription (comp/custom-deal accounts, where the column carries the deal
   * seat cap; console S2702). Paid companies WITH a subscription are billed
   * per seat by the gate in create/inviteUser instead of being capped. The
   * column (not the TIER_LIMITS constant) is read so the SUPER_ADMIN override
   * and the deal seat cap both keep working. Returns the loaded company so
   * callers can hand it to BillingService.reserveSeat without a second fetch;
   * null when there is no companyId.
   *
   * Callers pass the locked transaction's manager so the count + subsequent save run
   * serialized behind the company advisory lock (race audit 2026-07-07, P2): a plain
   * unlocked count-then-save lets two different-email adds both pass a cap of 1.
   */
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
    const appUrl = process.env.APP_URL || 'http://localhost:4200';
    const inviteUrl = `${appUrl}/accept-invite?token=${inviteToken}`;
    const variables = { role, name, email, inviteUrl };

    let subject: string;
    let text: string;

    try {
      const { data: templates } = await this.emailTemplatesService.findAll(
        companyId,
        1,
        1,
        EmailTemplateCategory.WELCOME,
      );

      if (templates.length > 0) {
        const rendered = await this.emailTemplatesService.render(
          templates[0].id,
          companyId,
          variables,
        );
        subject = rendered.subject;
        text = rendered.body;
      } else {
        subject = 'You have been invited to AALA.LAND';
        text = this.buildFallbackInviteText(variables);
      }
    } catch (err) {
      this.logger.warn(
        `Template lookup failed for invite to ${email}, using plaintext fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      subject = 'You have been invited to AALA.LAND';
      text = this.buildFallbackInviteText(variables);
    }

    await this.mailService.sendMail({ to: email, subject, text });
  }

  private buildFallbackInviteText(vars: {
    name: string;
    email: string;
    inviteUrl: string;
  }): string {
    return [
      `Hi ${vars.name},`,
      '',
      'You have been invited to AALA.LAND.',
      '',
      'Click the link below to set your password and activate your account:',
      vars.inviteUrl,
      '',
      'This link expires in 72 hours.',
    ].join('\n');
  }
}
