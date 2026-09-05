import { EventEmitter } from 'events';
import { ImportJobStatus } from 'src/modules/etl/interfaces';
import { Worker } from 'worker_threads';
import { ExportWorkerPoolService } from './export-worker-pool.service';

jest.mock('worker_threads', () => ({ Worker: jest.fn() }));

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ExportWorkerPoolService completion ordering', () => {
	function setup() {
		const worker = new EventEmitter();
		(Worker as unknown as jest.Mock).mockReturnValue(worker);
		const jobs = {
			updateProgress: jest.fn().mockResolvedValue(undefined),
			findById: jest
				.fn()
				.mockResolvedValue({ status: ImportJobStatus.PROCESSING }),
			markCompleted: jest.fn().mockResolvedValue(undefined),
		};
		const pool = new ExportWorkerPoolService(
			jobs as never,
			{} as never,
			{} as never,
			{} as never,
		);
		const result = (pool as any).spawnAndWait('job-1', 'tenant-1', {});
		return { worker, jobs, result };
	}

	it('drains progress and persists completion before settling on worker exit', async () => {
		const { worker, jobs, result } = setup();
		const progress = deferred();
		const completed = deferred();
		jobs.updateProgress.mockReturnValueOnce(progress.promise);
		jobs.markCompleted.mockReturnValueOnce(completed.promise);
		let settled = false;
		void result.then(() => {
			settled = true;
		});
		worker.emit('message', {
			type: 'progress',
			patch: { processedRows: 10 },
			force: true,
		});
		worker.emit('message', { type: 'done', result: { totalRows: 10 } });
		worker.emit('message', {
			type: 'progress',
			patch: { processedRows: 1 },
		});
		worker.emit('exit', 0);
		await drain();
		expect(jobs.markCompleted).not.toHaveBeenCalled();
		expect(settled).toBe(false);
		progress.resolve();
		await drain();
		expect(jobs.markCompleted).toHaveBeenCalledWith('job-1', {
			totalRows: 10,
			totalProcessedRows: 10,
		});
		expect(settled).toBe(false);
		completed.resolve();
		await result;
		await drain();
		expect(jobs.updateProgress).toHaveBeenCalledTimes(1);
	});

	it('rejects a clean exit without a terminal result', async () => {
		const { worker, result } = setup();
		const assertion = expect(result).rejects.toThrow(
			'without a terminal result',
		);
		worker.emit('exit', 0);
		await assertion;
	});

	it('propagates completion persistence failures instead of acknowledging success', async () => {
		const { worker, jobs, result } = setup();
		jobs.markCompleted.mockRejectedValue(new Error('database unavailable'));
		const assertion = expect(result).rejects.toThrow(
			'database unavailable',
		);
		worker.emit('message', { type: 'done', result: { totalRows: 10 } });
		worker.emit('exit', 0);
		await assertion;
	});
});
