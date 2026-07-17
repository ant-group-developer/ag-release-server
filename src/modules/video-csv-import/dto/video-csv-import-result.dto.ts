export interface VideoCsvImportError {
	isrc: string;
	message: string;
}

export interface VideoCsvImportResult {
	totalRows: number;
	matchedExistingVideo: number;
	createdVideoRelease: number;
	channelLinked: number;
	externalIdEnriched: number;
	channelSkipped: number;
	rowsSkipped: number;
	errors: VideoCsvImportError[];
}
