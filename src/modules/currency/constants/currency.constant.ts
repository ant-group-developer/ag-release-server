export const CurrencyMessageCodeSuccess = {
	CREATE: 'currency.message.success.create',
	UPDATE: 'currency.message.success.update',
	DELETE: 'currency.message.success.delete',
};

export const CurrencyMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const CurrencyMessageCodeError = {
	NOT_FOUND: 'currency.message.error.notFound',
	COUNTRY_NOT_FOUND: 'currency.message.error.countryNotFound',
	UNIQUE_CONSTRAINT: 'currency.message.error.uniqueConstraint',
};

export const CurrencyMessageError = {
	NOT_FOUND: 'Currency not found',
	COUNTRY_NOT_FOUND: 'Country not found',
	UNIQUE_CONSTRAINT: 'Currency already exists',
};

// data init
export const defaultCurrencies = [
	{ name: 'United States Dollar', code: 'USD' },
	{ name: 'Euro', code: 'EUR' },
	{ name: 'Japanese Yen', code: 'JPY' },
	{ name: 'British Pound Sterling', code: 'GBP' },
	{ name: 'Australian Dollar', code: 'AUD' },
	{ name: 'Canadian Dollar', code: 'CAD' },
	{ name: 'Swiss Franc', code: 'CHF' },
	{ name: 'Chinese Yuan', code: 'CNY' },
	{ name: 'Hong Kong Dollar', code: 'HKD' },
	{ name: 'Singapore Dollar', code: 'SGD' },
	{ name: 'New Zealand Dollar', code: 'NZD' },
	{ name: 'South Korean Won', code: 'KRW' },
	{ name: 'Indian Rupee', code: 'INR' },
	{ name: 'Brazilian Real', code: 'BRL' },
	{ name: 'Russian Rubles', code: 'RUB' },
	{ name: 'South African Rand', code: 'ZAR' },
	{ name: 'Mexican Peso', code: 'MXN' },
	{ name: 'Swedish Krona', code: 'SEK' },
	{ name: 'Norwegian Krone', code: 'NOK' },
	{ name: 'Danish Krone', code: 'DKK' },
	{ name: 'Vietnamese Dong', code: 'VND' },
	{ name: 'Thai Baht', code: 'THB' },
	{ name: 'Indonesian Rupiah', code: 'IDR' },
	{ name: 'Malaysian Ringgit', code: 'MYR' },
	{ name: 'Philippine Peso', code: 'PHP' },
	{ name: 'United Arab Emirates Dirham', code: 'AED' },
	{ name: 'Saudi Riyal', code: 'SAR' },
	{ name: 'Turkish Lira', code: 'TRY' },
	{ name: 'Israeli New Shekel', code: 'ILS' },
	{ name: 'New Taiwan Dollar', code: 'TWD' },
];
