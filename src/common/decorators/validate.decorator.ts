import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';

export function IsNotNullOrEmpty(validationOptions?: ValidationOptions) {
	return function (object: any, propertyName: string) {
		registerDecorator({
			name: 'IsNotNullOrEmpty',
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			validator: {
				validate(value: any, args: ValidationArguments) {
					return value !== null && value !== '';
				},
				defaultMessage(args: ValidationArguments) {
					return `${args.property} should not be null or empty`;
				},
			},
		});
	};
}

export function IsOptionalUndefined(validationOptions?: ValidationOptions) {
	return function (object: any, propertyName: string) {
		registerDecorator({
			name: 'IsOptionalUndefined',
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			validator: {
				validate(value: any, args: ValidationArguments) {
					return value === undefined;
				},
				defaultMessage(args: ValidationArguments) {
					return `${args.property} must be undefined if it is not provided`;
				},
			},
		});
	};
}
