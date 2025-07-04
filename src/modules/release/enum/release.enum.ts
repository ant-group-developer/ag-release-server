export enum ReleaseStatus {
	DRAFT = 'draft',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	NEVER_DISTRIBUTED = 'never_distributed',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}

export enum ReleaseType {
	ALBUM = 'album',
	SINGLE = 'single',
	EP = 'ep',
}

export enum FieldOrderRelease {
	TITLE = 'title',
	VERSION = 'version',
	C_LINE_OWNER = 'cLineOwner',
	P_LINE_OWNER = 'pLineOwner',
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',
}
