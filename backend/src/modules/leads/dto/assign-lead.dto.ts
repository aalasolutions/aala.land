import { IsUUID, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignLeadDto {
  @ApiProperty({ description: 'UUID of the agent to assign the lead to' })
  @IsUUID()
  @IsNotEmpty()
  agentId: string;

  @ApiPropertyOptional({ description: 'Reason for transferring the lead', example: 'Client prefers Arabic speaker' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
