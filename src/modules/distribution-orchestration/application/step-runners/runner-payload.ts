import { JobPayload } from '../ports/workflow-engine.port';

/**
 * Payload cho runner per-channel (upload/import-check/qa/export/status-sync).
 * Base JobPayload + channelId để runner load đúng ChannelDelivery.
 */
export interface ChannelJobPayload extends JobPayload {
	readonly channelId: string;
}
