export type TakedownEligibilityReason =
	| 'DELIVERY_NOT_FOUND'
	| 'NO_LIVE_VERSION'
	| 'ALREADY_TAKEN_DOWN';

export type TakedownEligibilityResult = {
	eligibleCodes: string[];
	skipped: {
		code: string;
		reason: TakedownEligibilityReason;
	}[];
};
