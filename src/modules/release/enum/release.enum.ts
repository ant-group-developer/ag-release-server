export enum ReleaseStatus {
	DRAFT = 'draft',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	NEVER_DISTRIBUTED = 'never_distributed',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}

export type ReleaseStatusNonDraft = Exclude<ReleaseStatus, ReleaseStatus.DRAFT>;

// export enum ReleaseType {
// 	ALBUM = 'album',
// 	SINGLE = 'single',
// 	EP = 'ep',
// }

export enum FieldOrderRelease {
	TITLE = 'title',
	VERSION = 'version',
	CREATED_AT = 'createdAt',
	TOTAL_DURATION = 'totalDuration',
	TRACKS_COUNT = 'tracksCount',
	UPDATED_AT = 'updatedAt',
}
