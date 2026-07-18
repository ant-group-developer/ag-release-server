import {
	EnqueueOptions,
	JobPayload,
	QueueName,
	WorkflowEnginePort,
} from '../../application/ports/workflow-engine.port';

/**
 * EnqueuedJob — bản ghi 1 job đã enqueue. Xuất kiểu này ra để test đọc trực tiếp
 * (không cần getter riêng). readonly để test không lỡ tay mutate.
 */
export interface EnqueuedJob {
	readonly queue: QueueName;
	readonly payload: JobPayload;
	readonly opts: EnqueueOptions;
	/** Thời điểm ảo (ms) job đến giờ chạy. So với clockMs của adapter. */
	readonly runAt: number;
	/** Thứ tự enqueue (FIFO khi cùng runAt). Test đôi khi cần assert thứ tự. */
	readonly seq: number;
}

/**
 * InMemoryWorkflowAdapter — adapter fake cho test.
 *
 * KHÔNG dùng setTimeout thật. Thay bằng "thời gian ảo":
 *   - clockMs = mốc thời gian ảo, chỉ đổi qua advanceTime()
 *   - enqueue(delayMs=N) → runAt = clockMs + N
 *   - due() → trả job có runAt <= clockMs (đến giờ chạy)
 *
 * Dedupe theo jobId (mô phỏng BullMQ layer 1). Enqueue trùng jobId → no-op.
 *
 * Test flow:
 *   1. adapter.enqueue(...)                    // job có runAt trong tương lai
 *   2. expect(adapter.due()).toHaveLength(0)   // chưa đến giờ
 *   3. adapter.advanceTime(delayMs)            // tua thời gian
 *   4. expect(adapter.due()).toHaveLength(1)   // giờ đến rồi
 *   5. adapter.consume() → run worker giả với job
 */
export class InMemoryWorkflowAdapter implements WorkflowEnginePort {
	private readonly _jobs: EnqueuedJob[] = [];
	private readonly _seenJobIds = new Set<string>();
	private _clockMs = 0;
	private _seq = 0;

	/** Xem hết queue (mọi job, kể cả chưa đến giờ). Test dùng để assert. */
	get all(): readonly EnqueuedJob[] {
		return this._jobs;
	}

	/** Giờ ảo hiện tại (ms). */
	get nowMs(): number {
		return this._clockMs;
	}

	async enqueue(
		queue: QueueName,
		payload: JobPayload,
		opts: EnqueueOptions = {},
	): Promise<void> {
		// dedupe theo jobId (mô phỏng BullMQ layer 1 — xem câu trả lời failure modes)
		if (opts.jobId && this._seenJobIds.has(opts.jobId)) {
			return; // no-op: BullMQ thật cũng từ chối
		}
		if (opts.jobId) this._seenJobIds.add(opts.jobId);

		this._jobs.push({
			queue,
			payload,
			opts,
			runAt: this._clockMs + (opts.delayMs ?? 0),
			seq: this._seq++,
		});
	}

	async schedule(
		queue: QueueName,
		payload: JobPayload,
		at: Date,
		opts: Omit<EnqueueOptions, 'delayMs'> = {},
	): Promise<void> {
		if (opts.jobId && this._seenJobIds.has(opts.jobId)) return;
		if (opts.jobId) this._seenJobIds.add(opts.jobId);

		this._jobs.push({
			queue,
			payload,
			opts,
			runAt: at.getTime(), // tuyệt đối, so với "giờ ảo" clockMs
			seq: this._seq++,
		});
	}

	// ── test helpers (không thuộc port interface) ──

	/** Tua thời gian ảo về phía trước N ms. */
	advanceTime(ms: number): void {
		if (ms < 0) throw new Error('advanceTime: ms must be >= 0');
		this._clockMs += ms;
	}

	/** Đặt thời gian ảo về mốc tuyệt đối. Dùng cho schedule(at) test. */
	setTime(at: Date): void {
		this._clockMs = at.getTime();
	}

	/** Job đã đến giờ chạy (runAt <= clockMs). Sắp theo (runAt, seq). */
	due(): EnqueuedJob[] {
		return this._jobs
			.filter((j) => j.runAt <= this._clockMs)
			.sort((a, b) => a.runAt - b.runAt || a.seq - b.seq);
	}

	/** Lấy job đã đến giờ ra khỏi queue (mô phỏng worker consume). */
	consume(): EnqueuedJob | undefined {
		const dueJobs = this.due();
		if (dueJobs.length === 0) return undefined;
		const job = dueJobs[0];
		const idx = this._jobs.indexOf(job);
		this._jobs.splice(idx, 1);
		return job;
	}

	/** Reset toàn bộ state — dùng ở beforeEach của test suite. */
	reset(): void {
		this._jobs.length = 0;
		this._seenJobIds.clear();
		this._clockMs = 0;
		this._seq = 0;
	}
}
