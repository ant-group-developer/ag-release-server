/**
 * Tên queue — single source of truth. Đổi giá trị string chỉ sửa ở đây,
 * mọi call site dùng QUEUES.XXX nên compiler tự báo lỗi nếu tham chiếu sai.
 */
export const QUEUES = {
	ORCHESTRATE: 'dist.orchestrate', // turn engine: nhận command, chạy 6 bước
	VALIDATE: 'dist.validate', // worker validate release metadata
	PROVISION_ID: 'dist.provision-id', // worker cấp UPC/ISRC
	BUILD_PACKAGE: 'dist.build-package', // worker build DDEX + upload GCS
	SFTP_UPLOAD: 'dist.sftp-upload', // worker upload SFTP tới DSP/aggregator
	CI_IMPORT_CHECK: 'dist.ci-import-check', // worker poll CI import status (WAIT INGEST)
	CI_QA_CHECK: 'dist.ci-qa-check', // worker poll CI QA flags (GATE qa)
	EXPORT_BATCH: 'dist.export-batch', // worker gom batch export (WAIT EXPORT)
	STATUS_SYNC: 'dist.status-sync', // worker poll DSP live/takedown status (WAIT PARTNER/GO_LIVE/TAKEDOWN)
} as const;

/** Union hẹp derive từ QUEUES — thêm queue mới = thêm vào object trên. */
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Options khi enqueue. Tất cả optional — mặc định adapter tự xử lý.
 */
export interface EnqueueOptions {
	/** Idempotency key = BullMQ jobId. Enqueue trùng → BullMQ từ chối (lớp phòng thủ 1). */
	readonly jobId?: string;
	/** Trễ N ms trước khi worker được pick job. Đây là "chờ không block". */
	readonly delayMs?: number;
	/** Số lần retry khi worker throw. RetryPolicy VO ở domain là gợi ý nguồn giá trị. */
	readonly attempts?: number;
}

/**
 * Payload chung — mọi job đều mang tối thiểu 3 field này.
 * Từng queue có thể mở rộng thêm field riêng qua generic.
 */
export interface JobPayload {
	readonly distributionId: string;
	/** Correlation ID xuyên suốt release — trace log cross-service (khớp CorrelationId VO domain). */
	readonly correlationId: string;
	/** Cùng giá trị với EnqueueOptions.jobId — worker log key này để soi trùng. */
	readonly key: string;
	/** Optional: for dist.orchestrate queue, mang toàn bộ DistributionCommand để worker gọi handler trực tiếp */
	readonly command?: unknown; // generic unknown để tránh circular dep; worker cast về DistributionCommand
	/** Optional: for channel-specific jobs (DELIVERING state), mang channelId */
	readonly channelId?: string;
	/** Optional: đếm số lần re-poll của bước WAIT (runner trả null) — dùng cho jobId re-poll unique */
	readonly pollAttempt?: number;
}

/**
 * WorkflowEnginePort — port của "nhịp".
 * Domain KHÔNG biết port này (nằm ở application). Handler + step-runners gọi để enqueue.
 * Adapter (Phase 2 Nhịp 1.3): InMemory (test). Adapter (Phase 2 Step 8): BullMQ (prod).
 */
export interface WorkflowEnginePort {
	/**
	 * Enqueue job. delayMs=0 → chạy ngay. delayMs>0 → ngủ trong queue N ms.
	 * At-least-once: có thể enqueue lặp — dedupe qua opts.jobId (BullMQ layer 1).
	 */
	enqueue(
		queue: QueueName,
		payload: JobPayload,
		opts?: EnqueueOptions,
	): Promise<void>;

	/**
	 * Lịch chạy tại 1 mốc thời gian tuyệt đối (khác delayMs = tương đối).
	 * Dùng cho scheduledAt của WAIT state — VD "wake up ngày mai 9h".
	 */
	schedule(
		queue: QueueName,
		payload: JobPayload,
		at: Date,
		opts?: Omit<EnqueueOptions, 'delayMs'>,
	): Promise<void>;
}

// ── DI token (NestJS: bind interface qua Symbol) ──
export const WORKFLOW_ENGINE = Symbol('WorkflowEnginePort');
