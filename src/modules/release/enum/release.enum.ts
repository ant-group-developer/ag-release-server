export enum ReleaseStatus {
	DRAFT = 'draft',
	SUBMITTED = 'submitted',
	PROCESSING = 'processing',
	UNRELEASED = 'unreleased',
	AWAITING_ACTION = 'awaiting_action', // bỏ
	DISTRIBUTED = 'distributed',
	PARTIAL_DONE = 'partial_done', // bỏ
	FAILED = 'failed',
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
	DSPS_LIVE = 'dsps_live',
}

export enum VirtualColumnRelease {
	TRACKS_COUNT = FieldOrderRelease.TRACKS_COUNT,
	TOTAL_DURATION = FieldOrderRelease.TOTAL_DURATION,
	DSPS_LIVE = FieldOrderRelease.DSPS_LIVE,
}

export const VirtualColumnReleaseArr = Object.values(
	VirtualColumnRelease,
) as string[];

export enum ReleaseCodeConst {
	CI = 'CI',
	SPOTIFY = 'SPOTIFY',
}
