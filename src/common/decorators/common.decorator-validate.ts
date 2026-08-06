import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';

export function IsStaticClass(
	cls: Record<string, any>,
	options?: ValidationOptions,
) {
	return function (target: object, propertyName: string) {
		registerDecorator({
			name: 'isStaticClass',
			target: target.constructor,
			propertyName,
			options,
			validator: {
				validate(value: any) {
					if (value === undefined || value === null) return true;

					const values = Object.entries(cls)
						.filter(
							([key, v]) =>
								typeof v === 'string' && key !== 'mainAlias',
						)
						.map(([, v]) => v);

					return values.includes(value);
				},
			},
		});
	};
}

export function IsValidName(minLength = 2, options?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isValidName',
			target: object.constructor,
			propertyName,
			constraints: [minLength],
			options,
			validator: {
				validate(value: any, args: ValidationArguments) {
					if (typeof value !== 'string') return false;
					const [min] = args.constraints;
					const trimmed = value.trim();
					if (trimmed.length < min) return false;
					return /[\p{L}\p{N}]/u.test(trimmed);
				},
				defaultMessage(args: ValidationArguments) {
					const [min] = args.constraints;
					return `${args.property} must be at least ${min} characters and contain at least one letter or number`;
				},
			},
		});
	};
}
