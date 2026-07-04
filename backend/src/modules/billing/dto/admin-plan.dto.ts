import { IsEnum, IsInt, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BillingPlan } from '../provider/billing-provider.interface';

export class AdminCheckoutDto {
    @ApiProperty({ description: 'Company to start checkout for', format: 'uuid' })
    @IsUUID()
    companyId: string;

    @ApiProperty({ description: 'Plan to subscribe to', enum: ['PRO', 'ENTERPRISE'] })
    @IsEnum(['PRO', 'ENTERPRISE'] as const)
    plan: BillingPlan;

    @ApiProperty({ description: 'Initial seat quantity', minimum: 1, example: 3 })
    @IsInt()
    @Min(1)
    quantity: number;

    @ApiProperty({ description: 'Stripe-format success redirect URL' })
    @IsString()
    successUrl: string;

    @ApiProperty({ description: 'Stripe-format cancel redirect URL' })
    @IsString()
    cancelUrl: string;
}

export class AdminChangePlanDto {
    @ApiProperty({ description: 'Company to switch plan for', format: 'uuid' })
    @IsUUID()
    companyId: string;

    @ApiProperty({ description: 'Target plan', enum: ['PRO', 'ENTERPRISE'] })
    @IsEnum(['PRO', 'ENTERPRISE'] as const)
    plan: BillingPlan;
}
