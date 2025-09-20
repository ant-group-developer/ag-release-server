export const TenantIssueFields = {
	ID: 'tenantIssue.id',
	SCORE: 'tenantIssue.score',
	START_DATE_AFFECT: 'tenantIssue.startDateAffect',
	END_DATE_AFFECT: 'tenantIssue.endDateAffect',
	IS_ACTIVE: 'tenantIssue.isActive',
	DESCRIPTION: 'tenantIssue.description',
	NOTE: 'tenantIssue.note',

	TENANT_ID: 'tenantIssue.tenantId',
	ISSUE_ID: 'tenantIssue.issueId',

	CREATED_AT: 'tenantIssue.createdAt',
	UPDATE_AT: 'tenantIssue.updatedAt',

	CREATOR_ID: 'tenantIssue.creatorId',
	MODIFIER_ID: 'tenantIssue.modifierId',
} as const;

export const TenantIssueCoreFields = {
	ID: 'tenantIssue.id',
	SCORE: 'tenantIssue.score',
	START_DATE_AFFECT: 'tenantIssue.startDateAffect',
	END_DATE_AFFECT: 'tenantIssue.endDateAffect',
	IS_ACTIVE: 'tenantIssue.isActive',
	DESCRIPTION: 'tenantIssue.description',
	NOTE: 'tenantIssue.note',
	TENANT_ID: 'tenantIssue.tenantId',
	ISSUE_ID: 'tenantIssue.issueId',
	CREATED_AT: 'tenantIssue.createdAt',
	UPDATE_AT: 'tenantIssue.updatedAt',
} as const;

export const TenantJoinCoreFields = {
	ID: 'tenant.id',
	NAME: 'tenant.name',
	TITLE: 'tenant.title',
	LOGO: 'tenant.logo',
	ICON: 'tenant.icon',
	IS_ACTIVE: 'tenant.isActive',
} as const;
