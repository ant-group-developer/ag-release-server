import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClickHouseService } from '../../../clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from '../../../clickhouse/clickhouse.constants';

/**
 * Frankfurter v2 API response format:
 * Array of { date, base, quote, rate }
 */
interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

export interface ExchangeRateRow {
  rate_month: string;
  currency: string;
  rate: number;
  rate_date: string;
  is_provisional: number;
}

/**
 * ExchangeRateService
 *
 * Quản lý tỷ giá EOM (End-of-Month) từ Frankfurter v2 API.
 * Lưu trữ trong bảng exchange_rates (ClickHouse).
 *
 * Flow:
 *  1. Trước mỗi import, gọi syncMonthsForPeriods() để đảm bảo có rate
 *  2. Import data → fact_sales_report → MV JOIN exchange_rates → cube v2
 *  3. backfillMissingRates() quét fact_sales_report tìm tháng thiếu rate
 *  4. rebuildCubes() truncate + rebuild cubes từ fact_sales_report + exchange_rates
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly API_BASE =
    process.env.FRANKFURTER_API_URL || 'http://localhost:8111/v2/rates';

  constructor(private readonly clickHouseService: ClickHouseService) {}

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════

  /**
   * Fetch & upsert EOM rate cho 1 tháng cụ thể.
   * @param yearMonth Định dạng 'YYYY-MM', ví dụ '2024-01'
   */
  async syncMonth(yearMonth: string): Promise<{ count: number }> {
    const eomDate = this.getEndOfMonthDate(yearMonth);
    this.logger.log(`Syncing exchange rates for ${yearMonth} (EOM: ${eomDate})...`);

    const rates = await this.fetchRatesFromApi(eomDate);
    if (!rates.length) {
      this.logger.warn(`No rates returned from API for date ${eomDate}`);
      return { count: 0 };
    }

    const rows: ExchangeRateRow[] = rates.map((r) => ({
      rate_month: yearMonth,
      currency: r.quote,
      rate: r.rate,
      rate_date: r.date,
      is_provisional: 0,
    }));

    // Thêm USD → 1.0 làm marker (đánh dấu tháng đã được sync)
    if (!rows.find((r) => r.currency === 'USD')) {
      rows.push({
        rate_month: yearMonth,
        currency: 'USD',
        rate: 1.0,
        rate_date: eomDate,
        is_provisional: 0,
      });
    }

    await this.clickHouseService.insert(
      CLICKHOUSE_TABLES.EXCHANGE_RATES,
      rows as unknown as Record<string, unknown>[],
    );

    this.logger.log(`✅ Synced ${rows.length} exchange rates for ${yearMonth}`);
    return { count: rows.length };
  }

  /**
   * Sync range of months (inclusive).
   * @param fromMonth 'YYYY-MM'
   * @param toMonth 'YYYY-MM'
   */
  async syncRange(
    fromMonth: string,
    toMonth: string,
  ): Promise<{ syncedMonths: string[]; totalRates: number }> {
    const months = this.generateMonthRange(fromMonth, toMonth);
    const alreadySynced = await this.getSyncedMonths();
    const toSync = months.filter((m) => !alreadySynced.has(m));

    if (!toSync.length) {
      this.logger.log(`All months in range ${fromMonth}..${toMonth} already synced`);
      return { syncedMonths: [], totalRates: 0 };
    }

    this.logger.log(`Syncing ${toSync.length} months: ${toSync.join(', ')}`);
    let totalRates = 0;
    const syncedMonths: string[] = [];

    for (const month of toSync) {
      try {
        const result = await this.syncMonth(month);
        totalRates += result.count;
        syncedMonths.push(month);
        // Delay 200ms để tránh rate limit API
        await this.delay(200);
      } catch (err) {
        this.logger.error(`Failed to sync ${month}: ${err.message}`);
      }
    }

    return { syncedMonths, totalRates };
  }

  /**
   * Sync exchange rates cho các tháng cụ thể (trước khi import).
   * Chỉ sync tháng chưa có trong exchange_rates.
   */
  async syncMonthsForPeriods(periods: string[]): Promise<void> {
    const uniqueMonths = [...new Set(periods)];
    const alreadySynced = await this.getSyncedMonths();
    const toSync = uniqueMonths.filter((m) => !alreadySynced.has(m));

    if (!toSync.length) return;

    this.logger.log(`Pre-import: syncing ${toSync.length} missing months: ${toSync.join(', ')}`);
    for (const month of toSync) {
      try {
        await this.syncMonth(month);
        await this.delay(200);
      } catch (err) {
        this.logger.error(`Failed to sync ${month}: ${err.message}`);
      }
    }
  }

  /**
   * Quét bảng fact_sales_report, tìm tất cả tháng chưa có rate
   * trong exchange_rates, tự động gọi API fetch toàn bộ.
   * Sau đó rebuild cubes từ source data.
   */
  async backfillMissingRates(): Promise<{
    syncedMonths: string[];
    totalRates: number;
  }> {
    this.logger.log('Scanning fact_sales_report for months without exchange rates...');

    const missingMonths = await this.clickHouseService.query<{
      rate_month: string;
    }>(`
      SELECT DISTINCT formatDateTime(reporting_period_start, '%Y-%m') AS rate_month
      FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT}
      WHERE formatDateTime(reporting_period_start, '%Y-%m') NOT IN (
          SELECT DISTINCT rate_month FROM ${CLICKHOUSE_TABLES.EXCHANGE_RATES}
      )
      ORDER BY rate_month ASC
    `);

    if (!missingMonths.length) {
      this.logger.log('All months in fact_sales_report already have exchange rates ✅');
      return { syncedMonths: [], totalRates: 0 };
    }

    const months = missingMonths.map((r) => r.rate_month);
    this.logger.log(`Found ${months.length} months without rates: ${months.join(', ')}`);

    let totalRates = 0;
    const syncedMonths: string[] = [];

    for (const month of months) {
      try {
        const result = await this.syncMonth(month);
        totalRates += result.count;
        syncedMonths.push(month);
        await this.delay(200);
      } catch (err) {
        this.logger.error(`Failed to sync ${month}: ${err.message}`);
      }
    }

    // Rebuild cubes sau khi sync xong
    await this.rebuildCubes();

    return { syncedMonths, totalRates };
  }

  /**
   * Truncate + rebuild cả 2 sales cubes v2 từ fact_sales_report + exchange_rates.
   * Gọi sau khi sync exchange rates hoặc khi cần refresh data.
   */
  async rebuildCubes(): Promise<{ dspRows: number; terRows: number }> {
    this.logger.log('Rebuilding sales cubes v2...');

    // Truncate cả 2 cubes
    await this.clickHouseService.execute(
      `TRUNCATE TABLE IF EXISTS ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}`,
    );
    await this.clickHouseService.execute(
      `TRUNCATE TABLE IF EXISTS ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}`,
    );

    // Rebuild DSP cube
    await this.clickHouseService.execute(`
      INSERT INTO ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}
      SELECT
          toStartOfMonth(f.reporting_period_start) AS period,
          f.dsp_id,
          f.isrc,
          sum(f.quantity) AS total_quantity,
          sum(f.revenue_local / if(er.rate > 0, er.rate, 1)) AS total_revenue_usd
      FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
      LEFT JOIN ${CLICKHOUSE_TABLES.EXCHANGE_RATES} er
          ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
          AND f.revenue_currency = er.currency
      GROUP BY period, f.dsp_id, f.isrc
    `);

    // Rebuild Territory cube
    await this.clickHouseService.execute(`
      INSERT INTO ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}
      SELECT
          toStartOfMonth(f.reporting_period_start) AS period,
          f.territory_code,
          f.isrc,
          sum(f.quantity) AS total_quantity,
          sum(f.revenue_local / if(er.rate > 0, er.rate, 1)) AS total_revenue_usd
      FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
      LEFT JOIN ${CLICKHOUSE_TABLES.EXCHANGE_RATES} er
          ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
          AND f.revenue_currency = er.currency
      GROUP BY period, f.territory_code, f.isrc
    `);

    // Get counts
    const dspCount = await this.clickHouseService.query<{ cnt: string }>(
      `SELECT count() AS cnt FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}`,
    );
    const terCount = await this.clickHouseService.query<{ cnt: string }>(
      `SELECT count() AS cnt FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}`,
    );

    const dspRows = Number(dspCount[0]?.cnt ?? 0);
    const terRows = Number(terCount[0]?.cnt ?? 0);

    this.logger.log(
      `✅ Cubes rebuilt — DSP: ${dspRows} rows, Territory: ${terRows} rows`,
    );

    return { dspRows, terRows };
  }

  /**
   * List exchange rates từ ClickHouse (có filter).
   */
  async listRates(filters?: {
    month?: string;
    currency?: string;
  }): Promise<ExchangeRateRow[]> {
    let where = 'WHERE 1=1';
    const params: Record<string, string> = {};

    if (filters?.month) {
      where += ' AND rate_month = {month:String}';
      params.month = filters.month;
    }
    if (filters?.currency) {
      where += ' AND currency = {currency:String}';
      params.currency = filters.currency.toUpperCase();
    }

    return this.clickHouseService.query<ExchangeRateRow>(
      `SELECT rate_month, currency, rate, rate_date, is_provisional
       FROM ${CLICKHOUSE_TABLES.EXCHANGE_RATES}
       ${where}
       ORDER BY rate_month DESC, currency ASC
       LIMIT 1000`,
      params,
    );
  }

  // ═══════════════════════════════════════════════════════
  // CRON
  // ═══════════════════════════════════════════════════════

  /**
   * Cron: Ngày 3 mỗi tháng lúc 3:00 AM
   * (ngày 3 để đảm bảo Frankfurter API đã có EOM rate của tháng trước)
   * - Sync rate chính thức cho tháng trước
   */
  @Cron('0 3 3 * *', { name: 'exchange-rate-monthly-sync' })
  async cronMonthlySync(): Promise<void> {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearMonth = this.formatYearMonth(prevMonth);

    this.logger.log(`[Cron] Syncing EOM rate for previous month: ${yearMonth}`);

    try {
      await this.syncMonth(yearMonth);
      // Rebuild cubes để cập nhật revenue
      await this.rebuildCubes();
    } catch (err) {
      this.logger.error(`[Cron] Monthly sync failed: ${err.message}`, err.stack);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  /**
   * Fetch all rates from Frankfurter v2 API for a specific date.
   * Returns ~170 currency pairs.
   */
  private async fetchRatesFromApi(date: string): Promise<FrankfurterRate[]> {
    const url = `${this.API_BASE}?base=USD&date=${date}`;
    this.logger.debug(`Fetching rates: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      const data: FrankfurterRate[] = await response.json();
      this.logger.debug(`Got ${data.length} rates for ${date}`);
      return data;
    } catch (err) {
      if (this.API_BASE.includes('localhost') || this.API_BASE.includes('127.0.0.1')) {
        this.logger.warn(`Local API failed: ${err.message}. Trying public Frankfurter API fallback...`);
        const fallbackUrl = `https://api.frankfurter.dev/v2/rates?base=USD&date=${date}`;
        try {
          const response = await fetch(fallbackUrl);
          if (response.ok) {
            const data: FrankfurterRate[] = await response.json();
            this.logger.debug(`Got ${data.length} rates from public fallback for ${date}`);
            return data;
          }
        } catch (fallbackErr) {
          this.logger.error(`Fallback public API also failed: ${fallbackErr.message}`);
        }
      }
      this.logger.error(`Frankfurter API error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Lấy danh sách tháng đã sync (đã có trong exchange_rates).
   */
  private async getSyncedMonths(): Promise<Set<string>> {
    const rows = await this.clickHouseService.query<{ rate_month: string }>(
      `SELECT DISTINCT rate_month FROM ${CLICKHOUSE_TABLES.EXCHANGE_RATES}`,
    );
    return new Set(rows.map((r) => r.rate_month));
  }

  /**
   * Tính ngày cuối tháng cho một YYYY-MM.
   * Ví dụ: '2024-01' → '2024-01-31', '2024-02' → '2024-02-29'
   */
  private getEndOfMonthDate(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    // Day 0 of next month = last day of current month
    const lastDay = new Date(year, month, 0);
    return lastDay.toISOString().slice(0, 10);
  }

  /**
   * Generate array of YYYY-MM from fromMonth to toMonth (inclusive).
   */
  private generateMonthRange(fromMonth: string, toMonth: string): string[] {
    const months: string[] = [];
    const [fromY, fromM] = fromMonth.split('-').map(Number);
    const [toY, toM] = toMonth.split('-').map(Number);

    let y = fromY;
    let m = fromM;
    while (y < toY || (y === toY && m <= toM)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return months;
  }

  /**
   * Format Date to YYYY-MM string.
   */
  private formatYearMonth(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
