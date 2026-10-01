export enum ReleaseMergeRunStatus {
	SCANNING = 'SCANNING',
	READY = 'READY',
	APPLYING = 'APPLYING',
	PARTIALLY_APPLIED = 'PARTIALLY_APPLIED',
	APPLIED = 'APPLIED',
	FAILED = 'FAILED',
}

export enum ReleaseMergeItemClassification {
	AUTO_SAFE = 'AUTO_SAFE',
	MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum ReleaseMergeItemStatus {
	PENDING = 'PENDING',
	APPLYING = 'APPLYING',
	APPLIED = 'APPLIED',
	MANUAL_REVIEW = 'MANUAL_REVIEW',
	STALE = 'STALE',
	FAILED = 'FAILED',
}

export enum ReleaseMergeTrigger {
	FULL_SCAN = 'FULL_SCAN',
	ASSET_IMPORT = 'ASSET_IMPORT',
}
