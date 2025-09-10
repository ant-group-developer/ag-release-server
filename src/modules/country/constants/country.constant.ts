export const CountryMessageCodeSuccess = {
	CREATE: 'country.message.success.create',
	UPDATE: 'country.message.success.update',
	DELETE: 'country.message.success.delete',
};

export const CountryMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

const CountryMessageCodeError = {
	DUPLICATE_NAME_COUNTRY: 'country.message.error.duplicateNameCountry',
	NOT_FOUND: 'country.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'country.message.error.cannotDeleteBecauseLinkedReleaseMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'country.message.error.cannotDeleteBecauseLinkedTrackMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS:
		'country.message.error.cannotDeleteBecauseLinkedTrackRecordings',
};

const CountryMessageError = {
	DUPLICATE_NAME_COUNTRY: 'Duplicate country name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'Cannot delete this country because it is linked to release metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'Cannot delete this country because it is linked to track metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS:
		'Cannot delete this country because it is linked to track recordings.',
};

export const CountryMessage = {
	NOT_FOUND: {
		message: CountryMessageError.NOT_FOUND,
		statusCode: 404,
	},

	DUPLICATE_NAME_COUNTRY: {
		message: CountryMessageError.DUPLICATE_NAME_COUNTRY,
		messageCode: CountryMessageCodeError.DUPLICATE_NAME_COUNTRY,
		statusCode: 409,
	},

	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES: {
		message:
			CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
		messageCode:
			CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
		statusCode: 400,
	},

	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES: {
		message:
			CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
		messageCode:
			CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
		statusCode: 400,
	},

	CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS: {
		message:
			CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS,
		messageCode:
			CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS,
		statusCode: 400,
	},
};

export const listCountriesInit = [
	{
		name: 'Afghanistan',
		iso3: 'AFG',
		iso2: 'AF',
		numericCode: '4',
		phoneCode: '93',
		capital: 'Kabul',
		currency: 'AFN',
		currencyName: 'Afghan Afghani',
		currencySymbol: '؋',
		regionId: 1,
		nationality: 'Afghan',
		continent: 'Asia',
	},
	{
		name: 'Albania',
		iso3: 'ALB',
		iso2: 'AL',
		numericCode: '8',
		phoneCode: '355',
		capital: 'Tirana',
		currency: 'ALL',
		currencyName: 'Albanian Lek',
		currencySymbol: 'Lek',
		regionId: 1,
		nationality: 'Albanian',
		continent: 'Europe',
	},
];
