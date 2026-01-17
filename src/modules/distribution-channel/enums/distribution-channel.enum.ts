export enum OrderFieldDistributionChannel {
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',
	TENANT_ID = 'tenantId',
	DSP_ID = 'dspId',
	AGGREGATOR_ID = 'aggregatorId',
	PROTOCOL = 'protocol',
	IS_SYSTEM_DEFAULT = 'isSystemDefault',
	IS_ACTIVE = 'isActive',
}

export enum DspAgreementType {
	ANT = 'ANT', // ANT Music
	MERLIN = 'MERLIN', // Merlin
	DIRECT = 'DIRECT', // Thoả thuận trực tiếp
	CI = 'CI', // CI (Content/Custom Integration)
}
