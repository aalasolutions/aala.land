import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    ForbiddenException,
    BadRequestException,
    HttpException,
    HttpStatus,
    Inject,
    Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, DataSource } from 'typeorm';
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
import { Company, SubscriptionTier } from '../companies/entities/company.entity';
import { Commission, CommissionStatus } from '../commissions/entities/commission.entity';
import { BillingService, SeatReservation } from '../billing/billing.service';
import { UserReassignmentService } from './reassignment/user-reassignment.service';
import { ReassignmentReport } from './reassignment/reassignment-report';
import {
    OwnershipTransferRecorder,
    OWNERSHIP_TRANSFER_RECORDER,
} from './reassignment/ownership-transfer-recorder';

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
        @Optional() @Inject(OWNERSHIP_TRANSFER_RECORDER)
        private readonly transferRecorder?: OwnershipTransferRecorder,
    ) { }

    async create(dto: CreateUserDto, companyId: string, requesterRole: Role): Promise<User> {
        if (dto.role) {
            const requesterLevel = getRoleLevel(requesterRole);
            const assignedLevel = getRoleLevel(dto.role);
            if (requesterRole !== Role.SUPER_ADMIN && assignedLevel <= requesterLevel) {
                throw new ForbiddenException('You are only allowed to assign roles with lower privilege than your own');
            }
        }

        const company = await this.enforceUserLimit(companyId);

        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);

        // Provider-first seat gate (contract section 9). All cheap local validations above run
        // BEFORE the provider call so an obvious rejection never churns the subscription.
        const seat: SeatReservation | null = company ? await this.billingService.reserveSeat(company) : null;

        try {
            const user = this.userRepository.create({ ...dto, password: hashedPassword, companyId });
            return await this.userRepository.save(user);
        } catch (err) {
            if (seat) await seat.release();
            throw err;
        }
    }

    async findAll(companyId: string | null | undefined, page = 1, limit = 20): Promise<{ data: User[]; total: number; page: number; limit: number }> {
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
        const user = await this.userRepository.findOne({ where: { id, ...(companyId ? { companyId } : {}) } });
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
            select: ['id', 'email', 'password', 'name', 'role', 'companyId', 'googleId', 'authProvider', 'isActive'],
        });
    }

    async findByIdForAuth(id: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { id },
            select: ['id', 'email', 'password', 'name', 'role', 'companyId', 'googleId', 'authProvider', 'isActive'],
        });
    }

    async findByGoogleId(googleId: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { googleId },
            select: ['id', 'email', 'password', 'name', 'role', 'companyId', 'googleId', 'authProvider', 'isActive'],
        });
    }

    async findByEmailOrGoogleId(email: string, googleId: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: [{ email }, { googleId }],
            select: ['id', 'email', 'password', 'name', 'role', 'companyId', 'googleId', 'authProvider', 'isActive'],
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
        if (!isSelfUpdate && requesterRole !== Role.SUPER_ADMIN && targetLevel <= requesterLevel) {
            throw new ForbiddenException('You do not have permission to update this user');
        }

        const updates: Partial<User> = { ...dto };

        // 🔒 Role change validation
        if (updates.role) {
            if (isSelfUpdate) {
                throw new ForbiddenException('You cannot change your own role');
            }

            const newRoleLevel = getRoleLevel(updates.role);

            if (requesterRole !== Role.SUPER_ADMIN && newRoleLevel <= requesterLevel) {
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
    // ------------------------------------------------------------------

    private isPaidTier(company: Company): boolean {
        return company.subscriptionTier !== SubscriptionTier.FREE;
    }

    /**
     * Wraps the Part 12 seat helper so any provider error surfaces as a clear
     * HTTP 402 billing message (contract section 9) instead of a raw 500.
     */
    private async callProviderSeatUpdate(company: Company, quantity: number): Promise<void> {
        try {
            await this.billingService.setSeatQuantity(company, quantity);
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw new HttpException(
                `The billing provider rejected the seat change: ${err instanceof Error ? err.message : String(err)}`,
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
    }

    /**
     * Provider-FIRST seat decrement (contract section 9).
     * Returns a compensator to run if the subsequent local transaction fails,
     * or null when no provider call was made (FREE tier).
     * purchasedSeats itself is only ever written by the unit 2 webhook.
     */
    private async decrementSeatBeforeRemoval(
        company: Company,
    ): Promise<{ compensate: () => Promise<void> } | null> {
        if (!this.isPaidTier(company)) return null;
        if (!company.billingSubscriptionId) {
            throw new HttpException(
                'This company has a paid plan but no active subscription. Complete checkout before removing users.',
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
        const previous = company.purchasedSeats;
        const target = Math.max(previous - 1, 1);
        await this.callProviderSeatUpdate(company, target);
        return {
            compensate: async () => {
                try {
                    await this.callProviderSeatUpdate(company, previous);
                } catch (err) {
                    this.logger.error(
                        `Seat compensation to ${previous} failed for company ${company.id}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            },
        };
    }

    /**
     * Shared validation for deactivate and delete. Resolves the target, the
     * reassignment recipient, and the company; enforces self, company-scope,
     * and role-hierarchy rules.
     */
    private async loadRemovalContext(
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
            throw new BadRequestException('The reassignment target must be a different user');
        }

        const target = await this.userRepository.findOne({
            where: { id: targetUserId, ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}) },
        });
        if (!target) {
            throw new NotFoundException('User not found');
        }
        if (options.requireActiveTarget && !target.isActive) {
            throw new BadRequestException('User is already inactive');
        }
        if (!target.companyId) {
            throw new BadRequestException('Users without a company cannot be removed through this flow');
        }

        const requesterLevel = getRoleLevel(requesterRole);
        const targetLevel = getRoleLevel(target.role);
        if (targetLevel <= requesterLevel && requesterRole !== Role.SUPER_ADMIN) {
            throw new ForbiddenException('You do not have permission to remove this user');
        }

        const reassignee = await this.userRepository.findOne({
            where: { id: dto.reassignToUserId, companyId: target.companyId, isActive: true },
        });
        if (!reassignee) {
            throw new NotFoundException('Reassignment target not found, inactive, or in a different company');
        }

        const company = await this.companyRepository.findOne({ where: { id: target.companyId } });
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
        const { target, reassignee, company } = await this.loadRemovalContext(
            targetUserId, requesterId, requesterCompanyId, requesterRole, dto,
            { requireActiveTarget: true },
        );

        // Contract section 9: provider FIRST, then the local transaction.
        const seat = await this.decrementSeatBeforeRemoval(company);

        try {
            return await this.dataSource.transaction(async (manager) => {
                await manager.update(User, target.id, { isActive: false });
                const report = await this.reassignmentService.reassignOwnedRecords(
                    manager, company.id, target.id, reassignee.id, dto.reason,
                );
                if (this.transferRecorder) {
                    await this.transferRecorder.record(manager, company.id, report);
                }
                return report;
            });
        } catch (err) {
            if (seat) await seat.compensate();
            throw err;
        }
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
        const { target, reassignee, company } = await this.loadRemovalContext(
            targetUserId, requesterId, requesterCompanyId, requesterRole, dto,
            { requireActiveTarget: false },
        );

        const lockedCommissions = await this.dataSource.getRepository(Commission).count({
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
        const seat = target.isActive ? await this.decrementSeatBeforeRemoval(company) : null;

        try {
            return await this.dataSource.transaction(async (manager) => {
                const report = await this.reassignmentService.reassignOwnedRecords(
                    manager, company.id, target.id, reassignee.id, dto.reason,
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
                await manager.delete(User, { id: target.id });

                return report;
            });
        } catch (err) {
            if (seat) await seat.compensate();
            throw err;
        }
    }

    /**
     * Downgrade preparation: deactivate every active user except keepUserId
     * and reassign all their records to that user, in one transaction. This
     * is what satisfies the unit 3 downgrade-to-Free gate (409 until exactly
     * one active user remains).
     *
     * Provider handling: one call setting the seat quantity to 1, provider
     * FIRST, only when a subscription exists. A paid-tier company WITHOUT a
     * subscription (a comp account: SUPER_ADMIN tier PATCH without checkout)
     * skips the provider call instead of throwing the section 9 HTTP 402,
     * because there is no provider quantity to change and a 402 would
     * dead-end the downgrade gate for exactly those companies. Post
     * external-cancel companies are already FREE (contract section 8) and
     * take the FREE branch; they never reach this skip. Contract exception
     * recorded in section 9 and section 16, pending owner ratification.
     */
    async trimToOneActiveUser(
        companyId: string,
        requesterId: string,
        dto: TrimCompanyUsersDto,
    ): Promise<{ deactivatedCount: number; reports: ReassignmentReport[] }> {
        const keeper = await this.userRepository.findOne({
            where: { id: dto.keepUserId, companyId, isActive: true },
        });
        if (!keeper) {
            throw new NotFoundException('The user to keep was not found or is inactive');
        }
        if (keeper.role !== Role.COMPANY_ADMIN) {
            throw new BadRequestException('The remaining user must be a company admin so the account can still be managed');
        }

        const company = await this.companyRepository.findOne({ where: { id: companyId } });
        if (!company) {
            throw new NotFoundException(`Company ${companyId} not found`);
        }

        const others = await this.userRepository.find({
            where: { companyId, isActive: true, id: Not(dto.keepUserId) },
            order: { createdAt: 'ASC' },
        });
        if (others.length === 0) {
            return { deactivatedCount: 0, reports: [] };
        }

        let compensate: (() => Promise<void>) | null = null;
        if (this.isPaidTier(company) && company.billingSubscriptionId) {
            const previous = company.purchasedSeats;
            await this.callProviderSeatUpdate(company, 1);
            compensate = async () => {
                try {
                    await this.callProviderSeatUpdate(company, previous);
                } catch (err) {
                    this.logger.error(
                        `Trim seat compensation to ${previous} failed for company ${company.id}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            };
        }

        try {
            const reports = await this.dataSource.transaction(async (manager) => {
                const collected: ReassignmentReport[] = [];
                for (const user of others) {
                    await manager.update(User, user.id, { isActive: false });
                    const report = await this.reassignmentService.reassignOwnedRecords(
                        manager, companyId, user.id, keeper.id, dto.reason,
                    );
                    if (this.transferRecorder) {
                        await this.transferRecorder.record(manager, companyId, report);
                    }
                    collected.push(report);
                }
                return collected;
            });
            this.logger.log(
                `Trimmed company ${companyId} to one active user (${keeper.id}) on request of ${requesterId}; deactivated ${others.length}`,
            );
            return { deactivatedCount: others.length, reports };
        } catch (err) {
            if (compensate) await compensate();
            throw err;
        }
    }

    /**
     * Reactivate a deactivated user. Mirror of deactivateUser: on paid plans
     * the provider seat +1 happens FIRST, then the local write; FREE plans
     * are gated by the same active-user cap as create and invite.
     */
    async reactivateUser(
        targetUserId: string,
        requesterCompanyId: string | undefined,
        requesterRole: Role,
    ): Promise<User> {
        const target = await this.userRepository.findOne({
            where: { id: targetUserId, ...(requesterCompanyId ? { companyId: requesterCompanyId } : {}) },
        });
        if (!target) {
            throw new NotFoundException('User not found');
        }
        if (target.isActive) {
            throw new BadRequestException('User is already active');
        }
        if (!target.companyId) {
            throw new BadRequestException('Users without a company cannot be reactivated through this flow');
        }

        const requesterLevel = getRoleLevel(requesterRole);
        const targetLevel = getRoleLevel(target.role);
        if (targetLevel <= requesterLevel && requesterRole !== Role.SUPER_ADMIN) {
            throw new ForbiddenException('You do not have permission to reactivate this user');
        }

        const company = await this.companyRepository.findOne({ where: { id: target.companyId } });
        if (!company) {
            throw new NotFoundException(`Company ${target.companyId} not found`);
        }

        let compensate: (() => Promise<void>) | null = null;
        if (this.isPaidTier(company)) {
            if (!company.billingSubscriptionId) {
                throw new HttpException(
                    'This company has a paid plan but no active subscription. Complete checkout before reactivating users.',
                    HttpStatus.PAYMENT_REQUIRED,
                );
            }
            const previous = company.purchasedSeats;
            await this.callProviderSeatUpdate(company, previous + 1);
            compensate = async () => {
                try {
                    await this.callProviderSeatUpdate(company, previous);
                } catch (err) {
                    this.logger.error(
                        `Reactivation seat compensation failed for company ${company.id}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            };
        } else {
            const activeCount = await this.userRepository.count({
                where: { companyId: target.companyId, isActive: true },
            });
            if (activeCount >= company.maxUsers) {
                throw new BadRequestException(
                    `Your ${company.subscriptionTier} plan allows up to ${company.maxUsers} active user${company.maxUsers === 1 ? '' : 's'}. Upgrade to reactivate.`,
                );
            }
        }

        try {
            await this.userRepository.update(target.id, { isActive: true });
        } catch (err) {
            if (compensate) await compensate();
            throw err;
        }
        return this.findOne(target.id, requesterCompanyId);
    }

    async findByResetToken(token: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { resetPasswordToken: token },
            select: ['id', 'email', 'resetPasswordToken', 'resetPasswordExpires'],
        });
    }

    async updateResetToken(userId: string, token: string | null, expires: Date | null): Promise<void> {
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
            where: companyId ? { companyId, role: Role.AGENT, isActive: true } : { role: Role.AGENT, isActive: true },
            select: ['id', 'name', 'email', 'role'],
            order: { name: 'ASC' },
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

    async inviteUser(companyId: string, dto: InviteUserDto, requesterRole: Role): Promise<User> {
        if (dto.role) {
            const requesterLevel = getRoleLevel(requesterRole);
            const assignedLevel = getRoleLevel(dto.role);
            if (requesterRole !== Role.SUPER_ADMIN && assignedLevel <= requesterLevel) {
                throw new ForbiddenException('You are only allowed to assign roles with lower privilege than your own');
            }
        }

        const company = await this.enforceUserLimit(companyId);

        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        const name = `${dto.firstName} ${dto.lastName}`;

        const user = this.userRepository.create({
            name,
            email: dto.email,
            password: placeholderPassword,
            role: dto.role,
            companyId,
            mustChangePassword: true,
        });

        // Provider-first seat gate (contract section 9). The compensation boundary is the user
        // save ONLY: once the row exists, the billed seat correctly mirrors a real user, so a
        // later token or email failure must NOT release the seat.
        const seat: SeatReservation | null = company ? await this.billingService.reserveSeat(company) : null;

        let saved: User;
        try {
            saved = await this.userRepository.save(user);
        } catch (err) {
            if (seat) await seat.release();
            throw err;
        }

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await this.updateResetToken(saved.id, inviteToken, inviteExpires);

        this.sendInviteEmail(companyId, dto.email, dto.role ?? '', name, inviteToken).catch((err) => {
            this.logger.error(`Failed to send invite email to ${dto.email}: ${err instanceof Error ? err.message : String(err)}`);
        });

        return saved;
    }

    /**
     * Caps apply on FREE only (contract section 11): paid tiers are billed per seat by the
     * gate in create/inviteUser instead of being capped. FREE keeps reading the maxUsers
     * COLUMN (not the TIER_LIMITS constant) so the existing SUPER_ADMIN PATCH override for
     * comp accounts keeps working. Returns the loaded company so callers can hand it to
     * BillingService.reserveSeat without a second fetch; null when there is no companyId.
     */
    private async enforceUserLimit(companyId: string | undefined): Promise<Company | null> {
        if (!companyId) return null;
        const company = await this.companyRepository.findOne({ where: { id: companyId } });
        if (!company) {
            throw new NotFoundException(`Company ${companyId} not found`);
        }
        if (company.subscriptionTier !== SubscriptionTier.FREE) {
            return company;
        }
        const currentCount = await this.userRepository.count({ where: { companyId, isActive: true } });
        if (currentCount >= company.maxUsers) {
            throw new BadRequestException(
                `Your FREE plan allows up to ${company.maxUsers} user${company.maxUsers === 1 ? '' : 's'}. Upgrade to Pro to add team members.`,
            );
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
                const rendered = await this.emailTemplatesService.render(templates[0].id, companyId, variables);
                subject = rendered.subject;
                text = rendered.body;
            } else {
                subject = 'You have been invited to AALA.LAND';
                text = this.buildFallbackInviteText(variables);
            }
        } catch (err) {
            this.logger.warn(`Template lookup failed for invite to ${email}, using plaintext fallback: ${err instanceof Error ? err.message : String(err)}`);
            subject = 'You have been invited to AALA.LAND';
            text = this.buildFallbackInviteText(variables);
        }

        await this.mailService.sendMail({ to: email, subject, text });
    }

    private buildFallbackInviteText(vars: { name: string; email: string; inviteUrl: string }): string {
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
