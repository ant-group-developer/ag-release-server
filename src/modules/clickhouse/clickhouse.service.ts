import { ClickHouseClient } from '@clickhouse/client';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CLICKHOUSE_CLIENT, CLICKHOUSE_TABLES } from './clickhouse.constants';

/**
 * ClickHouse service wrapper providing typed query methods,
 * bulk insert support, and health check capabilities.
 */
@Injectable()
export class ClickHouseService implements OnModuleDestroy {
	private readonly logger = new Logger(ClickHouseService.name);

	constructor(
		@Inject(CLICKHOUSE_CLIENT)
		private readonly client: ClickHouseClient,
	) {}

	/**
	 * Default hard cap resultset để tránh caller quên LIMIT → OOM.
	 * ClickHouse tự throw với `result_overflow_mode='throw'` khi vượt.
	 * Caller nào cần vượt ngưỡng (export lớn) truyền `settings` override.
	 */
	private static readonly DEFAULT_MAX_RESULT_ROWS = 200_000;
	private static readonly WARN_RESULT_ROWS = 10_000;

	/**
	 * Execute a SELECT query and return typed results.
	 *
	 * IMPORTANT: query() buffer TOÀN BỘ resultset vào RAM (result.json()) → nguy
	 * cơ OOM khi query quên LIMIT hoặc aggregation trả về nhiều row hơn dự kiến.
	 * Guard: `max_result_rows=200_000` + `result_overflow_mode='throw'` → CH throw
	 * fail-fast thay vì Node OOM. Nếu caller cần vượt ngưỡng (export lớn), truyền
	 * `settings: { max_result_rows: N }` để override. Cho dataset lớn thực sự,
	 * NÊN dùng queryStream() thay vì bump giới hạn.
	 */
	async query<T = Record<string, unknown>>(
		sql: string,
		params?: Record<string, unknown>,
		settings?: Record<string, string | number | boolean>,
	): Promise<T[]> {
		const startTime = Date.now();
		try {
			const result = await this.client.query({
				query: sql,
				query_params: params,
				format: 'JSONEachRow',
				clickhouse_settings: {
					max_result_rows: String(
						ClickHouseService.DEFAULT_MAX_RESULT_ROWS,
					),
					result_overflow_mode: 'throw',
					...settings,
				},
			});
			const data = await result.json<T>();
			const elapsed = Date.now() - startTime;
			if (data.length >= ClickHouseService.WARN_RESULT_ROWS) {
				this.logger.warn(
					`Query returned ${data.length} rows (>= ${ClickHouseService.WARN_RESULT_ROWS}) in ${elapsed}ms — cân nhắc thêm LIMIT hoặc chuyển sang queryStream. SQL: ${sql.substring(0, 120)}...`,
				);
			} else {
				this.logger.debug(
					`Query executed in ${elapsed}ms | ${sql.substring(0, 100)}...`,
				);
			}
			return data;
		} catch (error) {
			this.logger.error(`Query failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	/**
	 * Execute a SELECT query and stream results in chunks.
	 *
	 * Khác với `query()` (gọi `result.json()` parse TOÀN BỘ resultset đồng bộ →
	 * block event loop khi resultset lớn), method này dùng `result.stream()` đọc
	 * theo từng chunk row. Callback `onRows` được gọi cho mỗi nhóm row; giữa các
	 * nhóm event loop được giải phóng → không block HTTP handler.
	 *
	 * Dùng cho các query export lớn (hàng triệu dòng). Trả về tổng số row đã xử lý.
	 */
	async queryStream<T = Record<string, unknown>>(
		sql: string,
		params: Record<string, unknown> | undefined,
		onRows: (rows: T[]) => Promise<void> | void,
	): Promise<number> {
		const startTime = Date.now();
		let totalRows = 0;
		const resultSet = await this.client.query({
			query: sql,
			query_params: params,
			format: 'JSONEachRow',
		});

		try {
			const stream = resultSet.stream<T>();
			for await (const chunk of stream) {
				// Mỗi `chunk` là một mảng Row; mỗi Row.json() trả về object đã parse.
				const rows = chunk.map((row) => row.json());
				totalRows += rows.length;
				await onRows(rows);
			}
			this.logger.debug(
				`Stream query done: ${totalRows} rows in ${Date.now() - startTime}ms | ${sql.substring(0, 100)}...`,
			);
			return totalRows;
		} catch (error) {
			this.logger.error(
				`Stream query failed: ${error.message}`,
				error.stack,
			);
			throw error;
		} finally {
			resultSet.close();
		}
	}

	/**
	 * Bulk insert rows into a table.
	 * Uses @clickhouse/client stream-based insert for optimal performance
	 * when loading millions of rows.
	 */
	async insert<T extends Record<string, unknown>>(
		table: string,
		values: T[],
	): Promise<void> {
		if (!values.length) return;

		const startTime = Date.now();
		try {
			await this.client.insert({
				table,
				values,
				format: 'JSONEachRow',
			});
			this.logger.log(
				`Inserted ${values.length} rows into ${table} in ${Date.now() - startTime}ms`,
			);
		} catch (error) {
			this.logger.error(
				`Bulk insert into ${table} failed: ${error.message}`,
				error.stack,
			);
			throw error;
		}
	}

	/**
	 * Insert large datasets in configurable batch sizes.
	 * Prevents memory overflow when dealing with millions of rows.
	 */
	async insertBatched<T extends Record<string, unknown>>(
		table: string,
		values: T[],
		batchSize = 50_000,
	): Promise<{ totalRows: number; batches: number; durationMs: number }> {
		const startTime = Date.now();
		let batchCount = 0;

		for (let i = 0; i < values.length; i += batchSize) {
			const batch = values.slice(i, i + batchSize);
			await this.insert(table, batch);
			batchCount++;
			this.logger.log(
				`Batch ${batchCount}: ${batch.length} rows (${i + batch.length}/${values.length})`,
			);
		}

		const duration = Date.now() - startTime;
		this.logger.log(
			`Batched insert complete: ${values.length} rows in ${batchCount} batches (${duration}ms)`,
		);
		return {
			totalRows: values.length,
			batches: batchCount,
			durationMs: duration,
		};
	}

	/**
	 * Execute DDL/DML commands (CREATE, ALTER, DROP, etc.)
	 */
	async execute(sql: string): Promise<void> {
		try {
			await this.client.command({ query: sql });
			this.logger.debug(`Command executed: ${sql.substring(0, 100)}...`);
		} catch (error) {
			this.logger.error(`Command failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	/**
	 * Wait for async ALTER DELETE/UPDATE mutations before re-importing data.
	 */
	async waitForTableMutations(
		table: string,
		options?: {
			database?: string;
			timeoutMs?: number;
			pollMs?: number;
			commandContains?: string;
		},
	): Promise<void> {
		const database = options?.database ?? 'music_analytics';
		const timeoutMs =
			options?.timeoutMs ??
			Number(process.env.CLICKHOUSE_DELETE_MUTATION_TIMEOUT_MS ?? 900000);
		const pollMs =
			options?.pollMs ??
			Number(process.env.CLICKHOUSE_DELETE_MUTATION_POLL_MS ?? 5000);
		const startedAt = Date.now();

		await this.sleep(500);

		while (true) {
			const rows = await this.query<{
				mutation_id: string;
				command: string;
				latest_fail_reason: string;
			}>(
				`
          SELECT mutation_id, command, latest_fail_reason
          FROM system.mutations
          WHERE database = {database: String}
            AND table = {table: String}
            AND is_done = 0
            ${options?.commandContains ? 'AND position(command, {commandContains: String}) > 0' : ''}
        `,
				{
					database,
					table,
					...(options?.commandContains
						? { commandContains: options.commandContains }
						: {}),
				},
			);

			if (rows.length === 0) return;

			const failed = rows.find((row) => row.latest_fail_reason);
			if (failed) {
				throw new Error(
					`ClickHouse mutation ${failed.mutation_id} failed for ${database}.${table}: ${failed.latest_fail_reason}`,
				);
			}

			if (Date.now() - startedAt >= timeoutMs) {
				throw new Error(
					`Timed out waiting for ${rows.length} ClickHouse mutation(s) on ${database}.${table}`,
				);
			}

			await this.sleep(pollMs);
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Health check — ping ClickHouse server.
	 */
	async healthCheck(): Promise<{
		status: 'ok' | 'error';
		responseTimeMs: number;
		error?: string;
	}> {
		const startTime = Date.now();
		try {
			const result = await this.client.query({
				query: 'SELECT 1 AS ok',
				format: 'JSONEachRow',
			});
			await result.json();
			return {
				status: 'ok',
				responseTimeMs: Date.now() - startTime,
			};
		} catch (error) {
			return {
				status: 'error',
				responseTimeMs: Date.now() - startTime,
				error: error.message,
			};
		}
	}

	/**
	 * Get table schema info for fact_dsp_comprehensive_report.
	 */
	async getTableSchema(): Promise<
		Array<{
			name: string;
			type: string;
			default_expression: string;
			comment: string;
		}>
	> {
		const sql = `
      SELECT name, type, default_expression, comment
      FROM system.columns
      WHERE database = currentDatabase()
        AND table = '${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}'
      ORDER BY position
    `;
		return this.query(sql);
	}

	/**
	 * Get row count and disk usage stats.
	 */
	async getTableStats(): Promise<{
		rowCount: string;
		diskSizeBytes: string;
		partitions: string;
	}> {
		const sql = `
      SELECT
        formatReadableQuantity(sum(rows)) AS rowCount,
        formatReadableSize(sum(bytes_on_disk)) AS diskSizeBytes,
        toString(count()) AS partitions
      FROM system.parts
      WHERE database = currentDatabase()
        AND table = '${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}'
        AND active = 1
    `;
		const rows = await this.query<{
			rowCount: string;
			diskSizeBytes: string;
			partitions: string;
		}>(sql);
		return (
			rows[0] || { rowCount: '0', diskSizeBytes: '0 B', partitions: '0' }
		);
	}

	async onModuleDestroy() {
		this.logger.log('Closing ClickHouse connection...');
		await this.client.close();
	}
}
