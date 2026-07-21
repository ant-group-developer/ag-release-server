import {
	QUEUES,
	QueueName,
} from '../../application/ports/workflow-engine.port';

/**
 * REPOLL_DELAY_MS — delay (ms) khi runner trả `null` (chưa có kết quả → re-poll).
 *
 * Runner của các bước WAIT (poll external) trả `null` khi trạng thái còn 'pending'.
 * Worker KHÔNG block chờ — enqueue lại chính queue đó với delay này (nguyên tắc
 * "chờ không giữ tài nguyên", spec §2 + §8). Hết delay, BullMQ tự đánh thức job.
 *
 * Giá trị tĩnh cho Phase 5 (Khối D có thể tinh chỉnh / đọc config):
 *   · ci-import-check: CI import batch ~5 phút (doc §8 "queue.add(check, {delay: 5m})")
 *   · status-sync    : DSP duyệt 1–5 ngày → poll thưa (mặc định 1 giờ; scheduledAt
 *                      cho mốc xa hơn sẽ do runner tự set khi cần)
 *
 * Queue KHÔNG có trong map (orchestrate/validate/provision/build/sftp/qa/export)
 * không bao giờ trả `null` để re-poll → fallback DEFAULT (an toàn, hiếm dùng).
 */
const DEFAULT_REPOLL_MS = 60_000; // 1 phút

const REPOLL_BY_QUEUE: Partial<Record<QueueName, number>> = {
	[QUEUES.CI_IMPORT_CHECK]: 5 * 60_000, // 5 phút — CI import batch
	[QUEUES.STATUS_SYNC]: 60 * 60_000, // 1 giờ — DSP duyệt chậm
};

export function REPOLL_DELAY_MS(queue: QueueName): number {
	return REPOLL_BY_QUEUE[queue] ?? DEFAULT_REPOLL_MS;
}
