import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateOnly } from '@shared/decorators/is-date-only.decorator';
import { daysBetween, isDateOnly } from '@shared/utils/region-time.util';

// An uncapped span scans every transaction a company has ever recorded.
export const MAX_RANGE_DAYS = 366;

// Both ends are required together; a half-supplied range would drop the BETWEEN clause and answer with all-time totals.
const rangeTouched = (dto: QueryFinancialRangeDto): boolean =>
  dto.from !== undefined || dto.to !== undefined;

function IsWithinRangeCap(
  startProperty: string,
  maxDays: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isWithinRangeCap',
      target: object.constructor,
      propertyName: String(propertyName),
      options: {
        message: `date range must not exceed ${maxDays} days`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown, args: ValidationArguments): boolean => {
          const start = (args.object as Record<string, unknown>)[startProperty];
          // Malformed ends are reported by IsDateOnly, not here.
          if (!isDateOnly(start) || !isDateOnly(value)) return true;
          const span = Math.abs(daysBetween(start as string, value as string));
          return span + 1 <= maxDays;
        },
      },
    });
  };
}

export class QueryFinancialRangeDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  regionCode?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-01-01' })
  @ValidateIf(rangeTouched)
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-01-31' })
  @ValidateIf(rangeTouched)
  @IsDateOnly()
  @IsWithinRangeCap('from', MAX_RANGE_DAYS)
  to?: string;
}
