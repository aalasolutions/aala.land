import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { User } from './entities/user.entity';
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

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly mailService: MailService,
        private readonly emailTemplatesService: EmailTemplatesService,
    ) { }

    async create(dto: CreateUserDto, companyId: string, requesterRole: Role): Promise<User> {
        if (dto.role) {
            const requesterLevel = getRoleLevel(requesterRole);
            const assignedLevel = getRoleLevel(dto.role);
            if (requesterRole !== Role.SUPER_ADMIN && assignedLevel <= requesterLevel) {
                throw new ForbiddenException('You are only allowed to assign roles with lower privilege than your own');
            }
        }

        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({ ...dto, password: hashedPassword, companyId });
        return this.userRepository.save(user);
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

    async findByIdWithoutCompany(id: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { id },
            relations: ['company'],
        });
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { email },
            select: ['id', 'email', 'password', 'name', 'role', 'companyId'],
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

        const saved = await this.userRepository.save(user);

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await this.updateResetToken(saved.id, inviteToken, inviteExpires);

        this.sendInviteEmail(companyId, dto.email, dto.role ?? '', name, inviteToken).catch((err) => {
            this.logger.error(`Failed to send invite email to ${dto.email}: ${err instanceof Error ? err.message : String(err)}`);
        });

        return saved;
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
