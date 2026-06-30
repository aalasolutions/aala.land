import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Role } from '../../../shared/enums/roles.enum';

export enum AuthProvider {
    LOCAL = 'local',
    GOOGLE = 'google',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255, unique: true })
    email: string;

    @Column({ type: 'varchar', length: 255, nullable: true, select: false })
    password: string | null;

    @Index()
    @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true, unique: true })
    googleId: string | null;

    @Column({
        name: 'auth_provider',
        type: 'enum',
        enum: AuthProvider,
        default: AuthProvider.LOCAL,
    })
    authProvider: AuthProvider;

    @Column({
        type: 'enum',
        enum: Role,
        default: Role.AGENT,
    })
    role: Role;

    @Index()
    @Column({ name: 'company_id', type: 'uuid', nullable: true })
    companyId: string | null;

    @ManyToOne(() => Company)
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @Column({ type: 'varchar', length: 50, nullable: true })
    phone: string | null;

    @Column({ name: 'preferred_language', type: 'varchar', length: 5, default: 'en' })
    preferredLanguage: string;

    @Column({ name: 'date_format', type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
    dateFormat: string;

    @Column({ type: 'varchar', length: 50, default: 'Asia/Dubai' })
    timezone: string;

    @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
    lastLoginAt: Date | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'must_change_password', type: 'boolean', default: false })
    mustChangePassword: boolean;

    @Column({ name: 'reset_password_token', type: 'varchar', length: 255, nullable: true, select: false })
    resetPasswordToken: string | null;

    @Column({ name: 'reset_password_expires', type: 'timestamp', nullable: true, select: false })
    resetPasswordExpires: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
