export enum BackStageVideoStatus {
	ACTIVE = 'Active',
	INACTIVE = 'Inactive',
	NEEDS_ATTENTION = 'Needs Attention',
	IN_REVIEW = 'In Review',
	PROCESSING = 'Processing',
	DELETED = 'Deleted',
	UNRELEASED = 'Unreleased',
	EXPIRED = 'Expired',
	UNKNOWN = 'Unknown',
}

export interface SearchCiToolVevoReleaseInput {
	isrc: string;
}

export interface SearchCiToolVevoReleaseResponse {
	success: boolean;
	found: boolean;
	isrc: string;
	status: BackStageVideoStatus | null;
	message: string;
}

export interface QueueCiToolVevoReleasePayload {
	title: string;
	primaryArtists: string[];
	featuredArtists: string[];
	genres: string[];
	language: string;
	explicit: string;
	containsAiContent: string;
	isrc: string;
	contentProvider: string;
	label: string;
	repertoireOwner: string;
	channel: string;
	description: string;
	keywords: string[];
	madeForKids: string;
	visibility: string;
	videoFile: string;
	thumbnailKey: string;
	startTime: string;
	endTime: string;
	monetizeWorldwide: boolean;
	blockedTerritories: string[];
}

export interface QueueCiToolVevoReleaseResponse {
	jobId: string;
	state: string;
	waiting: number;
}

export interface GetCiToolVevoJobResponse {
	id: string;
	kind: string;
	state: string;
	attemptsMade: number;
	maxAttempts: number;
	timestamp: number;

	processedAt?: number | null;
	finishedAt?: number | null;

	progress: number;

	result?: CiToolVevoJobResult | null;

	debug?: boolean;
}

export interface CiToolVevoJobError {
	field: string;
	code: string;
	message: string;
	dump?: string;
}

export interface CiToolVevoJobResult {
	success: boolean;
	phase: string;
	filled: string[];
	errors: CiToolVevoJobError[];
	warnings: string[];
}
