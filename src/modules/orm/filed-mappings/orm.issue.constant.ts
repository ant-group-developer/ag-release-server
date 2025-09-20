import { pickFields } from 'src/utils/util';

export const IssueFields = {
	ID: 'issue.id',
	NAME_VI: 'issue.nameVi',
	NAME_EN: 'issue.nameEn',
	CODE: 'issue.code',
	SCORE: 'issue.score',
	NUMBER_OF_DAYS_AFFECT: 'issue.numberOfDaysAffect',
	DESCRIPTION: 'issue.description',
	NOTE: 'issue.note',
	ISSUE_LEVEL_ID: 'issue.issueLevelId',

	CREATED_AT: 'issue.createdAt',
	UPDATED_AT: 'issue.updatedAt',

	CREATOR_ID: 'issue.creatorId',
	MODIFIER_ID: 'issue.modifierId',
} as const;

export const IssueSimpleFields = pickFields(IssueFields, [
	'ID',
	'NAME_VI',
	'NAME_EN',
	'CODE',
	'SCORE',
	'NUMBER_OF_DAYS_AFFECT',
	'ISSUE_LEVEL_ID',
]);

export const IssueJoinCoreFields = pickFields(IssueFields, [
	'ID',
	'NAME_VI',
	'NAME_EN',
	'CODE',
	'SCORE',
	'NUMBER_OF_DAYS_AFFECT',
	'DESCRIPTION',
	'NOTE',
	'ISSUE_LEVEL_ID',
]);
