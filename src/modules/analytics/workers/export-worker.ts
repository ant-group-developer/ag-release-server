import { createClient, ClickHouseClient } from '@clickhouse/client';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Pool } from 'pg';
import * as fs from 'fs';
import { parentPort, workerData } from 'worker_threads';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import { ExportProgressPatch } from '../interfaces/analytics-report-export.interface';
import { ExportRunner, ExportRunnerDeps, ExportJobCancelledError } from '../services/export-runner';

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
      const rs = await ch.query({ query: sql, query_params: params, format: 'JSONEachRow' });
      return rs.json();
    },
    async chQueryStream(sql, params, onRows) {
      let total = 0;
      const rs = await ch.query({ query: sql, query_params: params, format: 'JSONEachRow' });
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
      return res.rows as any[];
    },
    async r2Upload({ key, filePath, contentType }) {
      const stat = await fs.promises.stat(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: privateBucket,
          Key: key,
          Body: fs.createReadStream(filePath),
          ContentType: contentType,
          ContentLength: stat.size,
        }),
      );
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
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    await ch.close().catch(() => undefined);
    await pg.end().catch(() => undefined);
  }
}

main().catch((err) => {
  parentPort?.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
});
