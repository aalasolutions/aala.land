import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async create(dto: CreateUserDto, companyId: string): Promise<User> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = this.userRepository.create({ ...dto, password: hashedPassword, companyId });
        return this.userRepository.save(user);
    }

    async findAll(companyId: string, page = 1, limit = 20): Promise<{ data: User[]; total: number; page: number; limit: number }> {
        const [data, total] = await this.userRepository.findAndCount({
            where: { companyId },
            skip: (page - 1) * limit,
            take: limit,
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

        if (dto.password) {
            dto.password = await bcrypt.hash(dto.password, 10);
        }

        Object.assign(user, dto);
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
}
