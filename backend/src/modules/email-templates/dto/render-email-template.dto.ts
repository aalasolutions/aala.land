import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenderEmailTemplateDto {
  @ApiProperty({ example: { firstName: 'Ahmed', propertyName: 'Marina Tower', amount: '5000' } })
  @IsObject()
  @IsNotEmpty()
  variables: Record<string, string>;
}
