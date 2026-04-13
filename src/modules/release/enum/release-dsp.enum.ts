export enum ReleaseDspStatus {
	DRAFT = 'draft',
	PROCESSING = 'processing',
	ISSUES = 'issues',
	NEVER_DISTRIBUTED = 'never_distributed',
	DISTRIBUTED = 'distributed',
	TAKEN_DOWN = 'taken_down',
}

export enum OrderFieldReleaseDspDelivery {
	releaseDspDelivery_createdAt = 'releaseDspDelivery.createdAt',
	releaseDspDelivery_updatedAt = 'releaseDspDelivery.updatedAt',
	releaseDspDelivery_releaseId = 'releaseDspDelivery.releaseId',
	releaseDspDelivery_dspId = 'releaseDspDelivery.dspId',
	releaseDspDelivery_status = 'releaseDspDelivery.status',
	releaseDspDelivery_lastEnqueuedAt = 'releaseDspDelivery.lastEnqueuedAt',
	releaseDspDelivery_lastDeliveredAt = 'releaseDspDelivery.lastDeliveredAt',
	dsp_name = 'dsp.name',
}
