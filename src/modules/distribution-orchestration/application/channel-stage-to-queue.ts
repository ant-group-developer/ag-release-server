import { ChannelDelivery } from '../domain/channel-delivery/channel-delivery.entity';
import { StageKind } from '../domain/channel-delivery/delivery-process';
import { QueueName } from './ports/workflow-engine.port';

/**
 * Pick which queue the channel's next job rides based on its current stage.
 *
 * Trách nhiệm application (không phải domain): queue name là hạ tầng BullMQ,
 * không phải business rule. Domain chỉ cấp `stage.kind` + `stage.waitKind` + `stage.key`.
 *
 * Mapping (spec §8):
 *   · ACTION `deliver`               → dist.sftp-upload    (upload folder + .done)
 *   · ACTION `request`  (takedown)   → dist.status-sync    (send takedown cmd + track via ticket)
 *   · GATE   `qa`                    → dist.ci-qa-check    (poll QA flags)
 *   · WAIT   waitKind='INGEST'       → dist.ci-import-check (poll import status)
 *   · WAIT   waitKind='EXPORT'       → dist.export-batch    (gom batch export)
 *   · WAIT   waitKind='PARTNER'|
 *             'GO_LIVE'|'TAKEDOWN'   → dist.status-sync     (poll DSP status)
 *
 * Terminal channels (isTerminal===true) → null (không có việc kế).
 * Unknown stage → null (giữ handler khỏi hard-fail; runner Step 5b sẽ log).
 */
export function pickChannelQueue(channel: ChannelDelivery): QueueName | null {
	if (channel.isTerminal) return null;
	const stage = channel.currentStage;
	if (!stage) return null;

	switch (stage.kind) {
		case StageKind.ACTION:
			if (stage.key === 'deliver') return 'dist.sftp-upload';
			if (stage.key === 'request') return 'dist.status-sync';
			return null;
		case StageKind.GATE:
			return 'dist.ci-qa-check';
		case StageKind.WAIT: {
			switch (stage.waitKind) {
				case 'INGEST':
					return 'dist.ci-import-check';
				case 'EXPORT':
					return 'dist.export-batch';
				case 'PARTNER':
				case 'GO_LIVE':
				case 'TAKEDOWN':
					return 'dist.status-sync';
				default:
					return 'dist.status-sync';
			}
		}
		default:
			return null;
	}
}
