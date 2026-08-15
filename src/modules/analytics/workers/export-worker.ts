import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ClickHouseClient, createClient } from '@clickhouse/client';
import * as fs from 'fs';
import { Pool } from 'pg';
import { parentPort, workerData } from 'worker_threads';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import { ExportProgressPatch } from '../interfaces/analytics-report-export.interface';
import {
	ExportJobCancelledError,
	ExportRunner,
	ExportRunnerDeps,
} from '../services/export-runner';

/**
 * Worker thread entry cho analytics export.
 *
 * Worker KHÔNG có Nest DI → tự dựng raw clients (ClickHouse / pg Pool / S3) từ
 * env. Giao tiếp với main thread:
 *  - workerData.cancelFlag: Int32Array trên SharedArrayBuffer; main set [0]=1 để huỷ.
 *  - postMessage({ type: 'progress', patch })   → main forward sang SSE.
 *  - postMessage({ type: 'fileName', fileName }) → main patch tên file.
 *  - postMessage({ type: 'done', result })       → kết quả cuối.
 *  - postMessage({ type: 'error', message })     → lỗi.
 *  - postMessage({ type: 'cancelled' })          → bị huỷ.
 */

interface WorkerInput {
	jobId: string;
	tenantId: string;
	dto: AnalyticsReportExportDto;
	cancelFlag: Int32Array;
	env: Record<string, string | undefined>;
}

const input = workerData as WorkerInput;
const env = input.env ?? process.env;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
const MULTIPART_UPLOAD_PART_SIZE_BYTES = 10 * 1024 * 1024;

function positiveEnvNumber(name: string, fallback: number): number {
	const value = Number(env[name]);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function buildClickHouse(): ClickHouseClient {
	return createClient({
		url: env.CLICKHOUSE_URL,
		database: env.CLICKHOUSE_DATABASE,
		username: env.CLICKHOUSE_USER,
		password: env.CLICKHOUSE_PASSWORD,
		clickhouse_settings: { async_insert: 1, wait_for_async_insert: 1 },
		request_timeout: 300_000,
	});
}

function buildPgPool(): Pool {
	return new Pool({
		host: env.DB_HOST,
		port: env.DB_PORT ? Number(env.DB_PORT) : 5432,
		user: env.DB_USERNAME,
		password: env.DB_PASSWORD,
		database: env.DB_DATABASE,
		max: 4,
	});
}

function buildS3(): {
	client: S3Client;
	privateBucket: string;
} {
	const client = new S3Client({
		region: 'auto',
		endpoint: env.R2_ENDPOINT,
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID!,
			secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
		},
		requestChecksumCalculation: 'WHEN_REQUIRED',
		responseChecksumValidation: 'WHEN_REQUIRED',
	});
	return { client, privateBucket: env.R2_PROTECTED_BUCKET! };
}

async function main() {
	const ch = buildClickHouse();
	const pg = buildPgPool();
	const { client: s3, privateBucket } = buildS3();

	const post = (msg: Record<string, unknown>) => parentPort?.postMessage(msg);

	const deps: ExportRunnerDeps = {
		async chQuery(sql, params) {
			const rs = await ch.query({
				query: sql,
				query_params: params,
				format: 'JSONEachRow',
				// Guard non-streaming queries so a future metadata/query change cannot
				// silently buffer an unbounded result set in this worker thread.
				clickhouse_settings: {
					max_memory_usage: String(
						positiveEnvNumber(
							'EXPORT_CLICKHOUSE_MAX_MEMORY_USAGE',
							4 * 1024 * 1024 * 1024,
						),
					),
					max_execution_time: positiveEnvNumber(
						'EXPORT_CLICKHOUSE_MAX_EXECUTION_TIME',
						900,
					),
					max_result_rows: String(
						positiveEnvNumber(
							'EXPORT_CLICKHOUSE_MAX_RESULT_ROWS',
							200_000,
						),
					),
					result_overflow_mode: 'throw',
				},
			});
			return rs.json();
		},
		async chQueryStream(sql, params, onRows) {
			let total = 0;
			const rs = await ch.query({
				query: sql,
				query_params: params,
				format: 'JSONEachRow',
			});
			try {
				const stream = rs.stream();
				for await (const chunk of stream) {
					const rows = (chunk as any[]).map((row) => row.json());
					total += rows.length;
					await onRows(rows as any);
				}
				return total;
			} finally {
				rs.close();
			}
		},
		async pgQuery(sql, params) {
			const res = await pg.query(sql, params as any[]);
			return res.rows;
		},
		async r2Upload({ key, filePath, contentType }) {
			const stat = await fs.promises.stat(filePath);
			const uploadParams = {
				Bucket: privateBucket,
				Key: key,
				Body: fs.createReadStream(filePath),
				ContentType: contentType,
				ContentLength: stat.size,
			};

			if (stat.size > MULTIPART_UPLOAD_THRESHOLD_BYTES) {
				const upload = new Upload({
					client: s3,
					params: uploadParams,
					partSize: MULTIPART_UPLOAD_PART_SIZE_BYTES,
					queueSize: 4,
				});
				let lastProgressAt = 0;
				upload.on('httpUploadProgress', (progress) => {
					const now = Date.now();
					if (now - lastProgressAt < 1_000) return;
					lastProgressAt = now;
					const loaded = progress.loaded ?? 0;
					const percentage = Math.min(
						100,
						Math.floor((loaded / stat.size) * 100),
					);
					post({
						type: 'progress',
						patch: {
							progressCurrent: 4,
							progressLabel: `Uploading ZIP file (${percentage}%)`,
						},
						force: false,
					});
				});
				await upload.done();
			} else {
				await s3.send(new PutObjectCommand(uploadParams));
			}
			return { bucketName: privateBucket, key };
		},
		async r2SignedUrlDown({ key, fileName }) {
			const cmd = new GetObjectCommand({
				Bucket: privateBucket,
				Key: key,
				ResponseContentDisposition: `attachment; filename=${fileName}`,
			});
			return getSignedUrl(s3, cmd, { expiresIn: 4 * 3600 });
		},
		async updateFileName(fileName) {
			post({ type: 'fileName', fileName });
		},
		async onProgress(patch: ExportProgressPatch, force?: boolean) {
			post({ type: 'progress', patch, force: !!force });
		},
		async isCancelled() {
			return Atomics.load(input.cancelFlag, 0) === 1;
		},
	};

	try {
		const runner = new ExportRunner(deps, input.jobId);
		const result = await runner.run(input.tenantId, input.dto);
		post({ type: 'done', result });
	} catch (err) {
		if (err instanceof ExportJobCancelledError) {
			post({ type: 'cancelled' });
		} else {
			post({
				type: 'error',
				message: err instanceof Error ? err.message : String(err),
			});
		}
	} finally {
		await ch.close().catch(() => undefined);
		await pg.end().catch(() => undefined);
	}
}

main().catch((err) => {
	parentPort?.postMessage({
		type: 'error',
		message: err instanceof Error ? err.message : String(err),
	});
});
