import {
	JobPayload,
	QUEUES,
} from '../../../application/ports/workflow-engine.port';
import { InMemoryWorkflowAdapter } from '../in-memory-workflow.adapter';

/**
 * Test spec cho InMemoryWorkflowAdapter — chứng minh "chờ không block" bằng thời gian ảo.
 *
 * Test này quan trọng vì adapter fake là nền cho MỌI test handler sau này.
 * Nếu contract sai ở đây → test handler xanh nhưng prod fail khi swap sang BullMQ.
 */
describe('InMemoryWorkflowAdapter', () => {
	let adapter: InMemoryWorkflowAdapter;

	// helper: tạo payload tối thiểu cho test — mọi test đều cần
	const payload = (distId = 'dist-1', key = 'k-1'): JobPayload => ({
		distributionId: distId,
		correlationId: 'corr-1',
		key,
	});

	beforeEach(() => {
		adapter = new InMemoryWorkflowAdapter();
	});

	// ── 1. enqueue delay=0 → sẵn sàng chạy ngay ─────────────────────────────
	it('enqueue with delayMs=0 makes job immediately due', async () => {
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload());

		expect(adapter.all).toHaveLength(1);
		expect(adapter.due()).toHaveLength(1);
		expect(adapter.due()[0].queue).toBe(QUEUES.ORCHESTRATE);
	});

	// ── 2. "chờ không block" — cốt lõi của Phase 2 ──────────────────────────
	it('enqueue with delayMs keeps job pending until advanceTime reaches runAt', async () => {
		const ONE_DAY = 24 * 60 * 60 * 1000;

		await adapter.enqueue(QUEUES.STATUS_SYNC, payload(), {
			delayMs: ONE_DAY,
			jobId: 'wait-partner:ch:0',
		});

		// chưa đến giờ
		expect(adapter.all).toHaveLength(1);
		expect(adapter.due()).toHaveLength(0);

		// tua 1 ngày (chỉ 1 dòng code — thay vì đợi 86_400_000 ms thật)
		adapter.advanceTime(ONE_DAY);

		// giờ đến
		expect(adapter.due()).toHaveLength(1);
		expect(adapter.due()[0].opts.jobId).toBe('wait-partner:ch:0');
	});

	// ── 3. dedupe theo jobId — lớp phòng thủ 1 ──────────────────────────────
	it('rejects duplicate enqueue when jobId matches (BullMQ layer 1 simulation)', async () => {
		const opts = { jobId: 'abc:packageBuilt:v1' };
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('abc'), opts);
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('abc'), opts); // trùng
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('abc'), opts); // trùng

		expect(adapter.all).toHaveLength(1);
	});

	// ── 4. schedule tại mốc thời gian tuyệt đối ─────────────────────────────
	it('schedule places job at absolute time; due after setTime(at)', async () => {
		const wakeUp = new Date('2026-07-17T09:00:00Z');
		await adapter.schedule(QUEUES.STATUS_SYNC, payload(), wakeUp);

		expect(adapter.due()).toHaveLength(0);

		// mô phỏng "trời sáng hôm sau"
		adapter.setTime(wakeUp);
		expect(adapter.due()).toHaveLength(1);
	});

	// ── 5. FIFO khi cùng runAt — deterministic ──────────────────────────────
	it('consumes jobs in enqueue order when runAt is equal', async () => {
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('a', 'k-a'));
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('b', 'k-b'));
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload('c', 'k-c'));

		expect(adapter.consume()?.payload.key).toBe('k-a');
		expect(adapter.consume()?.payload.key).toBe('k-b');
		expect(adapter.consume()?.payload.key).toBe('k-c');
		expect(adapter.consume()).toBeUndefined();
	});
});
