import { registerDecorator, ValidationOptions } from 'class-validator';
import { isDateOnly } from '../utils/region-time.util';

export function IsDateOnly(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName: String(propertyName),
      options: {
        message: '$property must be a valid date in YYYY-MM-DD format',
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => isDateOnly(value),
      },
    });
  };
}
