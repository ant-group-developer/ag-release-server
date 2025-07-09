export interface IReleaseLanguage {
	metadataLanguageCountryId: string | null;

	audioLanguageId: string | null;

	metadataLanguageId: string | null;

	releaseId: string;
}

export interface IReleaseLanguageDraft {
	metadataLanguageCountryId: string | null;

	audioLanguageId: string | null;

	metadataLanguageId: string | null;

	releaseId: string;
}

export interface IReleaseLanguageNonDraft {
	metadataLanguageCountryId: string;

	audioLanguageId: string;

	metadataLanguageId: string;

	releaseId: string;
}
