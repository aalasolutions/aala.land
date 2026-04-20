import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { paginationOptions } from '../../shared/utils/pagination.util';
import { MailService } from '../../shared/services/mail.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { EmailTemplateCategory } from '../email-templates/entities/email-template.entity';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly mailService: MailService,
        private readonly emailTemplatesService: EmailTemplatesService,
    ) { }

    async create(dto: CreateUserDto, companyId: string): Promise<User> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({ ...dto, password: hashedPassword, companyId });
        return this.userRepository.save(user);
    }

    async findAll(companyId: string, page = 1, limit = 20): Promise<{ data: User[]; total: number; page: number; limit: number }> {
        const [data, total] = await this.userRepository.findAndCount({
            where: { companyId },
            ...paginationOptions(page, limit),
            order: { createdAt: 'DESC' },
        });
        return { data, total, page, limit };
    }

    async findOne(id: string, companyId: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id, companyId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { email },
            select: ['id', 'email', 'password', 'name', 'role', 'companyId'],
        });
    }

    async update(id: string, companyId: string, dto: UpdateUserDto): Promise<User> {
        const user = await this.findOne(id, companyId);

        const updates = { ...dto };
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 12);
        }

        Object.assign(user, updates);
        return this.userRepository.save(user);
    }

    async remove(id: string, companyId: string): Promise<void> {
        const user = await this.findOne(id, companyId);
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

    async findAgents(companyId: string): Promise<User[]> {
        return this.userRepository.find({
            where: { companyId, isActive: true },
            select: ['id', 'name', 'email', 'role'],
            order: { name: 'ASC' },
        });
    }

    async inviteUser(companyId: string, dto: InviteUserDto): Promise<User> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        const name = `${dto.firstName} ${dto.lastName}`;

        const user = this.userRepository.create({
            name,
            email: dto.email,
            password: hashedPassword,
            role: dto.role,
            companyId,
            mustChangePassword: true,
        });

        const saved = await this.userRepository.save(user);

        this.sendInviteEmail(companyId, dto.email, name, tempPassword).catch((err) => {
            this.logger.error(`Failed to send invite email to ${dto.email}: ${err instanceof Error ? err.message : String(err)}`);
        });

        return saved;
    }

    private async sendInviteEmail(
        companyId: string,
        email: string,
        name: string,
        tempPassword: string,
    ): Promise<void> {
        const loginUrl = `${process.env.APP_URL || 'http://localhost:4200'}/login`;
        const variables = { name, email, password: tempPassword, loginUrl };

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

    private buildFallbackInviteText(vars: { name: string; email: string; password: string; loginUrl: string }): string {
        return [
            `Hi ${vars.name},`,
            '',
            'You have been invited to AALA.LAND.',
            '',
            `Email: ${vars.email}`,
            `Temporary Password: ${vars.password}`,
            '',
            `Login at: ${vars.loginUrl}`,
            '',
            'You will be asked to change your password on first login.',
        ].join('\n');
    }
}
