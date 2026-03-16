import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { User } from '../users/entities/user.entity';
import { Region, resolveRegions } from '@shared/constants/regions';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

interface LoginUser {
    id: string;
    name: string;
    email: string;
    role: string;
    companyId: string;
}

interface RefreshUser {
    email: string;
    userId: string;
    companyId: string;
    role: string;
}

interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        companyId: string;
    };
    regions: Region[];
    defaultRegionCode: string;
}

interface RefreshResponse {
    accessToken: string;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly companiesService: CompaniesService,
    ) { }

    async validateUser(email: string, pass: string): Promise<Omit<User, 'password'> | null> {
        const user = await this.usersService.findByEmail(email);
        if (user && await bcrypt.compare(pass, user.password)) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: LoginUser): Promise<LoginResponse> {
        const payload = {
            email: user.email,
            sub: user.id,
            companyId: user.companyId,
            role: user.role,
        };

        const company = await this.companiesService.findOne(user.companyId);

        return {
            accessToken: this.jwtService.sign(payload),
            refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                companyId: user.companyId,
            },
            regions: resolveRegions(company.activeRegions),
            defaultRegionCode: company.defaultRegionCode,
        };
    }

    async refresh(user: RefreshUser): Promise<RefreshResponse> {
        const payload = {
            email: user.email,
            sub: user.userId,
            companyId: user.companyId,
            role: user.role,
        };
        return {
            accessToken: this.jwtService.sign(payload),
        };
    }

    async forgotPassword(email: string): Promise<{ message: string }> {
        const user = await this.usersService.findByEmail(email);

        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            await this.usersService.updateResetToken(user.id, token, expires);

            // TODO: Wire to email service. For now, log token generation without exposing it.
            this.logger.debug(`Password reset token generated for ${email}`);
        }

        // Always return success to avoid leaking whether email exists
        return { message: 'If the email exists, a password reset link has been sent.' };
    }

    async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
        const user = await this.usersService.findByResetToken(token);

        if (!user) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.usersService.updatePassword(user.id, hashedPassword);
        await this.usersService.updateResetToken(user.id, null, null);

        return { message: 'Password has been reset successfully.' };
    }
}
