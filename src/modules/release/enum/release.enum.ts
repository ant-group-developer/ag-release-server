export enum ReleaseStatus {
	DRAFT = 'draft',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	NEVER_DISTRIBUTED = 'never_distributed',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}

export enum ReleaseTimeMode {
	GLOBAL_MIDNIGHT = 'global_midnight',
	SPECIFIC_TIMEZONE = 'specific_timezone',
}

export type ReleaseStatusNonDraft = Exclude<ReleaseStatus, ReleaseStatus.DRAFT>;

export enum FieldOrderRelease {
	TITLE = 'title',
	VERSION = 'version',
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',

	RELEASE_DATE = 'releaseDate',

	// virtual
	TRACKS_COUNT = 'tracks_count',
	TOTAL_DURATION = 'total_duration',
}

export enum VirtualColumnRelease {
	TRACKS_COUNT = FieldOrderRelease.TRACKS_COUNT,
	TOTAL_DURATION = FieldOrderRelease.TOTAL_DURATION,
}

export const VirtualColumnReleaseArr = Object.values(
	VirtualColumnRelease,
) as string[];
