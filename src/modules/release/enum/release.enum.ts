export enum ReleaseStatus {
	DRAFT = 'draft',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	NEVER_DISTRIBUTED = 'never_distributed',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}

export type ReleaseStatusNonDraft = Exclude<ReleaseStatus, ReleaseStatus.DRAFT>;

export enum FieldOrderRelease {
	TITLE = 'title',
	VERSION = 'version',
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',

	// virtual
	TRACKS_COUNT = 'tracks_count',
	TOTAL_DURATION = 'total_duration',
}

export enum VirtualColumnRelease {
	TRACKS_COUNT = 'tracks_count',
	TOTAL_DURATION = 'total_duration',
}
