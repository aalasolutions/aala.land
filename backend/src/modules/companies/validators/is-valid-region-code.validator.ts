import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { getRegionByCode } from '../../../shared/constants/regions';

@ValidatorConstraint({ name: 'IsValidRegionCode', async: false })
export class IsValidRegionCode implements ValidatorConstraintInterface {
  validate(value: string, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return getRegionByCode(value) !== undefined;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'defaultRegionCode must be a valid region code';
  }
}
