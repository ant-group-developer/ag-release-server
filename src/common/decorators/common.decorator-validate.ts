import { registerDecorator, ValidationOptions } from 'class-validator';

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
