import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(Company)
        private readonly companiesRepository: Repository<Company>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
        });
    }

    async validate(payload: { sub: string; email: string; companyId: string; role: string }) {
        const user = await this.usersRepository.findOne({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                role: true,
                companyId: true,
                isActive: true,
            },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('User no longer exists or is inactive');
        }

        const company = await this.companiesRepository.findOne({
            where: { id: user.companyId },
            select: {
                id: true,
                isActive: true,
            },
        });

        if (!company || !company.isActive) {
            throw new UnauthorizedException('Company no longer exists or is inactive');
        }

        return {
            userId: user.id,
            email: user.email,
            companyId: user.companyId,
            role: user.role
        };
    }
}
