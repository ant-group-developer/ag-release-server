export interface ITrackLanguage {
	metadataLanguageCountryId: string | null;
	audioLanguageId: string | null;
	metadataLanguageId: string | null;
	trackId: string;
}

export interface ICreateTrackLanguage {
	metadataLanguageCountryId?: string | null;
	audioLanguageId?: string | null;
	metadataLanguageId?: string | null;
	recordingCountryId?: string | null;
	trackId: string;
}

export interface IUpdateTrackLanguage {
	metadataLanguageCountryId?: string | null;
	audioLanguageId?: string | null;
	metadataLanguageId?: string | null;
	recordingCountryId?: string | null;
}

export interface ITrackLanguageDraft {
	metadataLanguageCountryId: string | null;
	audioLanguageId: string | null;
	metadataLanguageId: string | null;
	trackId: string;
}

export interface ITrackLanguageNonDraft {
	metadataLanguageCountryId: string;
	audioLanguageId: string;
	metadataLanguageId: string;
	trackId: string;
}
