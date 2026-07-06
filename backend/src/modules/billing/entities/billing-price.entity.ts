import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { BillingPriceKind } from '../provider/billing-provider.interface';

@Entity('billing_prices')
@Index('UQ_billing_prices_active', ['kind', 'currency'], { unique: true, where: '"active" = true' })
export class BillingPrice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 32 })
    kind: BillingPriceKind;

    @Column({ type: 'varchar', length: 3 })
    currency: string;

    @Column({ name: 'unit_amount', type: 'integer' })
    unitAmount: number;

    @Column({ type: 'varchar', length: 32, default: 'stripe' })
    provider: string;

    @Column({ name: 'provider_price_id', type: 'varchar', length: 255, nullable: true })
    providerPriceId: string | null;

    @Column({ type: 'boolean', default: true })
    active: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
