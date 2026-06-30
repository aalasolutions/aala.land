import { IsIn } from 'class-validator';

export class CreateCheckoutSessionDto {
    @IsIn(['STARTER', 'PRO'])
    tier: 'STARTER' | 'PRO';
}
