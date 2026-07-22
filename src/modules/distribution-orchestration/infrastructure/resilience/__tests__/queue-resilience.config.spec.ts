import { QUEUES } from '../../../application/ports/workflow-engine.port';
import { queueConcurrency, queueRetry } from '../queue-resilience.config';

describe('queue-resilience.config', () => {
	describe('queueConcurrency (bulkhead)', () => {
		it('SFTP concurrency thấp + limiter (isolation)', () => {
			const cfg = queueConcurrency(QUEUES.SFTP_UPLOAD);
			expect(cfg.concurrency).toBe(2);
			expect(cfg.limiter).toEqual({ max: 5, duration: 1000 });
		});

		it('queue không cấu hình → default concurrency 1, không limiter', () => {
			const cfg = queueConcurrency(QUEUES.VALIDATE);
			expect(cfg.concurrency).toBe(1);
			expect(cfg.limiter).toBeUndefined();
		});
	});

	describe('queueRetry (backoff mapping)', () => {
		it('SFTP 3 lần exp từ 30s (khớp RetryPolicy.sftpDefault)', () => {
			expect(queueRetry(QUEUES.SFTP_UPLOAD)).toEqual({
				attempts: 3,
				backoffMs: 30_000,
			});
		});

		it('queue không cấu hình → default 1 lần (idempotent, không retry)', () => {
			expect(queueRetry(QUEUES.VALIDATE)).toEqual({
				attempts: 1,
				backoffMs: 1000,
			});
		});
	});
});
