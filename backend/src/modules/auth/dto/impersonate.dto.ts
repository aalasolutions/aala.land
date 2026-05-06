import { IsUUID } from 'class-validator';

export class ImpersonateDto {
  @IsUUID()
  userId: string;
}
