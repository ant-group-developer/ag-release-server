export const LanguageMessageCodeSuccess = {
	CREATE: 'language.message.success.create',
	UPDATE: 'language.message.success.update',
	DELETE: 'language.message.success.delete',
};

export const LanguageMessageSuccess = {
	CREATE: 'Create success',
	UPDATE: 'Update success',
	DELETE: 'Delete success',
};

export const LanguageMessageCodeError = {
	DUPLICATE_NAME_LANGUAGE: 'language.message.error.duplicateNameLanguage',
	DUPLICATE_CODE_LANGUAGE: 'language.message.error.duplicateCodeLanguage',
	NOT_FOUND: 'language.message.error.notFound',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_LOCALIZES:
		'language.message.error.cannotDeleteBecauseLinkedReleaseLocalizes',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_AUDIO_LANGUAGES:
		'language.message.error.cannotDeleteBecauseLinkedReleaseAudioLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'language.message.error.cannotDeleteBecauseLinkedReleaseMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_AUDIO_LANGUAGES:
		'language.message.error.cannotDeleteBecauseLinkedTrackAudioLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'language.message.error.cannotDeleteBecauseLinkedTrackMetadataLanguages',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_LOCALIZES:
		'language.message.error.cannotDeleteBecauseLinkedTrackLocalizes',
};

export const LanguageMessageError = {
	DUPLICATE_NAME_LANGUAGE: 'Duplicate language name',
	DUPLICATE_CODE_LANGUAGE: 'Duplicate language code',
	NOT_FOUND: 'Not found',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_LOCALIZES:
		'Cannot delete this language because it is linked to release localizations.',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_AUDIO_LANGUAGES:
		'Cannot delete this language because it is linked to release audio languages.',
	CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES:
		'Cannot delete this language because it is linked to release metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_AUDIO_LANGUAGES:
		'Cannot delete this language because it is linked to track audio languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES:
		'Cannot delete this language because it is linked to track metadata languages.',
	CANNOT_DELETE_BECAUSE_LINKED_TRACK_LOCALIZES:
		'Cannot delete this language because it is linked to track localizations.',
};
