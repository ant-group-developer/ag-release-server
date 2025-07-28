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

export const CountryMessageCodeError = {
	DUPLICATE_NAME_COUNTRY: 'country.message.error.duplicateNameCountry',
	NOT_FOUND: 'country.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'country.message.error.cannotDeleteBecauseLinkedReleaseMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'country.message.error.cannotDeleteBecauseLinkedTrackMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS:
		'country.message.error.cannotDeleteBecauseLinkedTrackRecordings',
};

export const CountryMessageError = {
	DUPLICATE_NAME_COUNTRY: 'Duplicate country name',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'Cannot delete this country because it is linked to release metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'Cannot delete this country because it is linked to track metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS:
		'Cannot delete this country because it is linked to track recordings.',
};
