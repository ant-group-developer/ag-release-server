/**
 * ProcessCodeResolver — parse processCode thành cấu hình build DDEX.
 *
 * processCode format (từ process-code.helper.ts):
 *   DIRECT:          '{dspCode}.{initial|takedown}'           e.g. 'spotify.initial'
 *   VIA_AGGREGATOR:  '{agg}.{deal|state51}.{initial}'         e.g. 'ci.deal.initial'
 *                    '{agg}.takedown'                          e.g. 'ci.takedown'
 *
 * Resolver tách processCode thành:
 *   - dspRoute: segment đầu (dspCode hoặc aggregatorCode)
 *   - action:   segment cuối ('initial' hoặc 'takedown')
 *   - isAggregator: true nếu 3 segments hoặc segment đầu = aggregator code
 */

/** Config resolved từ processCode — đủ để adapter biết cần gì. */
export interface PackageBuildConfig {
	/** dspCode hoặc aggregator code — dùng để query DspRoutingConfigsService. */
	readonly dspRoute: string;

	/** 'initial' (distribute/update) hoặc 'takedown'. */
	readonly action: 'initial' | 'takedown';

	/**
	 * True nếu processCode là VIA_AGGREGATOR (e.g. 'ci.deal.initial').
	 * CI aggregator cần manifest (BatchComplete XML).
	 */
	readonly isAggregator: boolean;

	/** Full processCode gốc — dùng cho logging. */
	readonly rawCode: string;
}

/**
 * Parse processCode → PackageBuildConfig.
 *
 * @example
 * parseProcessCode('spotify.initial')    → { dspRoute: 'SPOTIFY', action: 'initial', isAggregator: false }
 * parseProcessCode('ci.deal.initial')    → { dspRoute: 'CI', action: 'initial', isAggregator: true }
 * parseProcessCode('ci.takedown')        → { dspRoute: 'CI', action: 'takedown', isAggregator: true }
 * parseProcessCode('vevo.takedown')      → { dspRoute: 'VEVO', action: 'takedown', isAggregator: false }
 */
export function parseProcessCode(processCode: string): PackageBuildConfig {
	const segments = processCode.split('.');
	if (segments.length < 2 || segments.length > 3) {
		throw new Error(
			`Invalid processCode format: "${processCode}" — expected 2-3 dot-separated segments`,
		);
	}

	const dspRoute = segments[0].toUpperCase();
	const lastSegment = segments[segments.length - 1];

	if (lastSegment !== 'initial' && lastSegment !== 'takedown') {
		throw new Error(
			`Invalid processCode action: "${lastSegment}" in "${processCode}" — expected "initial" or "takedown"`,
		);
	}

	// 3 segments = VIA_AGGREGATOR pattern: '{agg}.{deal|state51}.{action}'
	// 2 segments với aggregator code = aggregator takedown: '{agg}.takedown'
	const knownAggregators = ['ci']; // expandable
	const isAggregator =
		segments.length === 3 ||
		knownAggregators.includes(segments[0].toLowerCase());

	return {
		dspRoute,
		action: lastSegment,
		isAggregator,
		rawCode: processCode,
	};
}
