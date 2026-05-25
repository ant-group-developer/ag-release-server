import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClickHouseClient } from '@clickhouse/client';
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
   * Execute a SELECT query and return typed results.
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const startTime = Date.now();
    try {
      const result = await this.client.query({
        query: sql,
        query_params: params,
        format: 'JSONEachRow',
      });
      const data = await result.json<T>();
      this.logger.debug(
        `Query executed in ${Date.now() - startTime}ms | ${sql.substring(0, 100)}...`,
      );
      return data;
    } catch (error) {
      this.logger.error(`Query failed: ${error.message}`, error.stack);
      throw error;
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
    return { totalRows: values.length, batches: batchCount, durationMs: duration };
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
    Array<{ name: string; type: string; default_expression: string; comment: string }>
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
    return rows[0] || { rowCount: '0', diskSizeBytes: '0 B', partitions: '0' };
  }

  async onModuleDestroy() {
    this.logger.log('Closing ClickHouse connection...');
    await this.client.close();
  }
}
