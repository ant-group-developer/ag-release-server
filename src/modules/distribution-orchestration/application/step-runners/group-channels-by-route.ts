import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ExecutionPolicy } from '../../domain/policies/execution-policy.port';

/**
 * BuildGroup — 1 nhóm phân phối cùng đích vật lý (ernVersion + sender + SFTP).
 * Mọi channel trong nhóm share CÙNG package đã build.
 */
export interface BuildGroup {
	/** Khóa nhóm = dspRoute (segment đầu của processCode, viết hoa). VD 'SPOTIFY', 'CI'. */
	readonly groupKey: string;
	/**
	 * processCode ĐẠI DIỆN để build package cho nhóm.
	 * Trong 1 nhóm aggregator (CI) các channel có thể khác lane (deal/state51) → processCode
	 * khác nhau ('ci.deal.initial' vs 'ci.state51.initial') nhưng cùng dspRoute. Lane KHÔNG
	 * ảnh hưởng XML/ernVersion/recipient (recipient=aggregator), nên chọn cái đầu tiên là đủ.
	 */
	readonly processCode: string;
	/** dspCode của mọi channel thuộc nhóm (debug/logging). */
	readonly dspCodes: string[];
}

/**
 * groupKeyOf — dspRoute của 1 processCode = segment đầu viết hoa.
 * Mirror `parseProcessCode` (infrastructure) nhưng KHÔNG import infra để giữ layering:
 *   'spotify.initial'    → 'SPOTIFY'   (DIRECT: 1 nhóm/DSP)
 *   'ci.deal.initial'    → 'CI'        (AGGREGATOR: gom mọi DSP cùng aggregator)
 *   'ci.state51.initial' → 'CI'
 */
export function groupKeyOf(processCode: string): string {
	const first = processCode.split('.')[0];
	if (!first) {
		throw new Error(
			`groupChannelsByRoute: invalid processCode "${processCode}"`,
		);
	}
	return first.toUpperCase();
}

/**
 * groupChannelsByRoute — gom channelSpecs thành các nhóm build theo dspRoute.
 *
 * Với mỗi spec: resolve processCode (spec.processCode || policy.resolveProcessCode(spec)) —
 * giống hệt Distribution.ensureChannelsSpawned + BuildPackageRunner cũ — rồi lấy dspRoute làm
 * khóa nhóm. Kết quả: 1 BuildGroup/dspRoute, build 1 package cho mỗi nhóm.
 *
 * VD 3 DSP (Spotify direct, Apple qua CI, Facebook qua CI) → 2 nhóm: SPOTIFY + CI.
 *
 * @throws nếu specs rỗng (caller phải guard trước, đây là lưới an toàn).
 */
export function groupChannelsByRoute(
	specs: readonly ChannelDeliverySpec[],
	policy: ExecutionPolicy,
): BuildGroup[] {
	if (specs.length === 0) {
		throw new Error('groupChannelsByRoute: empty channelSpecs');
	}

	const groups = new Map<string, { processCode: string; dspCodes: string[] }>();

	for (const spec of specs) {
		const processCode = spec.processCode || policy.resolveProcessCode(spec);
		const key = groupKeyOf(processCode);

		const existing = groups.get(key);
		if (existing) {
			existing.dspCodes.push(spec.dspCode);
		} else {
			// processCode đại diện = của channel ĐẦU TIÊN gặp trong nhóm (lane không ảnh hưởng build).
			groups.set(key, { processCode, dspCodes: [spec.dspCode] });
		}
	}

	return [...groups.entries()].map(([groupKey, { processCode, dspCodes }]) => ({
		groupKey,
		processCode,
		dspCodes,
	}));
}
