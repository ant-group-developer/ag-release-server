export enum ScanStatus {
	RUNNING = 'running',
	PENDING = 'pending',
	FINISHED = 'finished',
	FAILED = 'failed',
	CANCEL = 'cancel',
}

export enum ErrorTask {
	CANCEL_TASK = 'cancel_task',
	FAIL_PROCESSING_SINGLE_TRACK = 'fail_processing_single_track',
}
