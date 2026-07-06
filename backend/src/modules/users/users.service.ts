import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { User, AuthProvider } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { getRoleLevel } from '../../shared/utils/auth.util';
import { MailService } from '../../shared/services/mail.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { EmailTemplateCategory } from '../email-templates/entities/email-template.entity';
import { Role } from '../../shared/enums/roles.enum';
import { Company, SubscriptionTier } from '../companies/entities/company.entity';
import { BillingService, SeatReservation } from '../billing/billing.service';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
        private readonly mailService: MailService,
        private readonly emailTemplatesService: EmailTemplatesService,
        private readonly billingService: BillingService,
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

    async remove(targetUserId: string, companyId: string | undefined, requesterRole: string): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: targetUserId, ...(companyId ? { companyId } : {}) } });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const requesterLevel = getRoleLevel(requesterRole as Role);
        const targetLevel = getRoleLevel(user.role as Role);

        if (targetLevel <= requesterLevel && requesterRole !== Role.SUPER_ADMIN) {
            throw new ForbiddenException('You do not have permission to delete this user');
        }

        await this.userRepository.remove(user);
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
