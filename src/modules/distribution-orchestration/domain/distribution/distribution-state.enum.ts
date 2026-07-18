/**
 * DistributionState — the Distribution-level state machine (MILESTONE, release-level).
 *
 * Two-tier principle (decided 2026-07-13): state = a small set of milestones sharing one vocabulary;
 * technical detail (import batch, QA flag, retry attempt count…) is a DOMAIN EVENT on the timeline,
 * NOT a state. Do NOT turn v3 steps into states.
 *
 * There is NO transition back to DRAFT after submit — errors go to ACTION_REQUIRED (before channels)
 * or PARTIALLY_DISTRIBUTED/FAILED (after channels), each with a ticket.
 */
export enum DistributionState {
	DRAFT = 'DRAFT', // before submit — entered exactly once, no going back
	VALIDATING = 'VALIDATING', // checking schema/asset
	IN_REVIEW = 'IN_REVIEW', // waiting for a reviewer (only when tenant.requiresManualReview)
	PROVISIONING_IDS = 'PROVISIONING_IDS', // provision UPC/ISRC (INITIAL); UPDATE passes through but no-ops
	BUILDING_PACKAGE = 'BUILDING_PACKAGE', // DDEX XML + folder → GCS/S3 (TAKEDOWN skips)
	DELIVERING = 'DELIVERING', // fan-out channels in parallel
	// ── terminal / semi-terminal ──
	DISTRIBUTED = 'DISTRIBUTED', // every channel done
	PARTIALLY_DISTRIBUTED = 'PARTIALLY_DISTRIBUTED', // ≥1 done & ≥1 issues
	FAILED = 'FAILED', // 0 channels done
	ACTION_REQUIRED = 'ACTION_REQUIRED', // validation error / reviewer reject → user must fix (NOT DRAFT)
	TAKEN_DOWN = 'TAKEN_DOWN',
}
