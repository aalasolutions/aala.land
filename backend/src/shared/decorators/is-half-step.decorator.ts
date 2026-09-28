import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsHalfStep(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isHalfStep',
      target: object.constructor,
      propertyName: String(propertyName),
      options: {
        message: '$property must be a whole or half number, such as 2 or 2.5',
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'number' && Number.isInteger(value * 2),
      },
    });
  };
}
