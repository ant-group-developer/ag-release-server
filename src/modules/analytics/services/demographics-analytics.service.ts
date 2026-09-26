import { BadRequestException, Injectable } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	AnalyticsFilterSetDto,
	DemographicsAggregateChartQueryDto,
	DemographicsQueryDto,
	VevoDemographicsBarChartQueryDto,
} from '../dto/analytics-query.dto';
import {
	DemographicsBarChartItem,
	DemographicsBarChartResponse,
} from '../interfaces/analytics.interface';
import {
	buildAnalyticsFactFilters,
} from '../utils/analytics-series-filter.util';
import {
	buildOwnershipJoin,
	getOwnershipLedgerFallbackPredicate,
} from '../utils/ownership-join.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
	appendAnalyticsVideoScopeFilter,
	getAnalyticsVideoScope,
} from './analytics-video-scope.service';

export interface DemographicsBreakdownItem {
	/** Chỉ có khi groupByTerritory = true */
	territoryCode?: string;
	dimensionValue: string;
	views: number;
	percent: number;
}

export interface DemographicsDeviceResponse {
	totalViews: number;
	items: DemographicsBreakdownItem[];
}

export interface DemographicsEstimateResponse {
	totalViewsEstimate: number;
	/** sum(views_estimate) / total views devices — null khi không có views devices để so sánh */
	coverage: number | null;
	items: DemographicsBreakdownItem[];
}

type AggregatedRow = {
	territoryCode: string;
	dimensionValue: string;
	views: number;
};

type DemographicsCubeRow = {
	territory_code?: string;
	dimension_value: string;
	views: string;
};

/** Thứ tự hiển thị chuẩn của các bucket tuổi; giá trị lạ xếp cuối. */
const AGE_ORDER = [
	'AGE_13_17',
	'AGE_18_24',
	'AGE_25_34',
	'AGE_35_44',
	'AGE_45_54',
	'AGE_55_64',
	'AGE_65_',
];

/**
 * Breakdown demographics (device / gender / age) cho 1 track ISRC từ
 * trends_demographics_cube. Cube KHÔNG có cột tenant — scoping được resolve
 * lúc query qua ownership join, cùng convention với các analytics khác.
 *
 * Quy tắc % (bắt buộc — xem PLAN_VEVO_DEMOGRAPHICS mục 4.3):
 *   - device: chuẩn hoá theo tổng views của chính dimension device
 *   - gender/age: chuẩn hoá theo tổng views_estimate trong dimension đó,
 *     KHÔNG chuẩn hoá chéo theo total views devices
 */
@Injectable()
export class DemographicsAnalyticsService {
	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly cache: AnalyticsCacheService,
	) {}

	async getDeviceBreakdown(
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<DemographicsDeviceResponse> {
		const key = this.cache.buildKey('demographics:device', tenantId, {
			isrc,
			...dto,
		});
		return this.cache.wrap(key, async () => {
			const { rows, total } = await this.queryDimension(
				'device',
				dto,
				tenantId,
				isrc,
			);
			this.sortRows(rows, 'device', dto.groupByTerritory === true);
			return {
				totalViews: total,
				items: this.toBreakdownItems(rows, dto.groupByTerritory === true),
			};
		});
	}

	async getGenderBreakdown(
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<DemographicsEstimateResponse> {
		const key = this.cache.buildKey('demographics:gender', tenantId, {
			isrc,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeEstimateBreakdown('gender', isrc, dto, tenantId),
		);
	}

	async getAgeBreakdown(
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<DemographicsEstimateResponse> {
		const key = this.cache.buildKey('demographics:age', tenantId, {
			isrc,
			...dto,
		});
		return this.cache.wrap(key, () =>
			this.computeEstimateBreakdown('age_group', isrc, dto, tenantId),
		);
	}

	async getDspDeviceBarChart(
		dto: VevoDemographicsBarChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		const key = this.cache.buildKey('demographics:dsp-device', tenantId, dto);
		return this.cache.wrap(key, async () => {
			if (!(await this.shouldQueryVevoDemographics(dto))) {
				return { totalViews: 0, coverage: null, items: [] };
			}
			const { rows, total } = await this.queryDimension(
				'device',
				dto,
				tenantId,
			);
			this.sortRows(rows, 'device', false);
			return {
				totalViews: total,
				coverage: null,
				items: this.toBarChartItems(rows),
			};
		});
	}

	async getDspGenderBarChart(
		dto: VevoDemographicsBarChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		const key = this.cache.buildKey('demographics:dsp-gender', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeDspEstimateBarChart('gender', dto, tenantId),
		);
	}

	async getDspAgeBarChart(
		dto: VevoDemographicsBarChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		const key = this.cache.buildKey('demographics:dsp-age', tenantId, dto);
		return this.cache.wrap(key, () =>
			this.computeDspEstimateBarChart('age_group', dto, tenantId),
		);
	}

	/**
	 * V2 widgets use one shared array-filter payload. The demographics cube is
	 * Vevo-only; dspIds therefore act as a Vevo-pair eligibility filter while
	 * all catalog filters are applied directly to the cube facts.
	 */
	async getDspDeviceBarChartV2(
		dto: DemographicsAggregateChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		this.assertValidDateRange(dto);
		const key = this.cache.buildKey('demographics:dsp-device-v2', tenantId, dto);
		return this.cache.wrap(key, async () => {
			if (!(await this.shouldQueryVevoDemographicsV2(dto))) {
				return { totalViews: 0, coverage: null, items: [] };
			}
			const { rows, total } = await this.queryDimensionV2(
				'device',
				dto,
				tenantId,
			);
			this.sortRows(rows, 'device', false);
			return {
				totalViews: total,
				coverage: null,
				items: this.toBarChartItems(rows),
			};
		});
	}

	async getDspGenderBarChartV2(
		dto: DemographicsAggregateChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		return this.getDspEstimateBarChartV2('gender', dto, tenantId);
	}

	async getDspAgeBarChartV2(
		dto: DemographicsAggregateChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		return this.getDspEstimateBarChartV2('age_group', dto, tenantId);
	}

	// ─────────────────────────────────────────────────────
	// Compute
	// ─────────────────────────────────────────────────────

	private async computeDspEstimateBarChart(
		dimension: 'gender' | 'age_group',
		dto: VevoDemographicsBarChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		if (!(await this.shouldQueryVevoDemographics(dto))) {
			return { totalViews: 0, coverage: null, items: [] };
		}
		const [dimensionResult, deviceResult] = await Promise.all([
			this.queryDimension(dimension, dto, tenantId),
			this.queryDimension('device', dto, tenantId),
		]);
		this.sortRows(dimensionResult.rows, dimension, false);
		return {
			totalViews: dimensionResult.total,
			coverage:
				deviceResult.total > 0
					? Math.round(
							(dimensionResult.total / deviceResult.total) * 10000,
						) / 10000
					: null,
			items: this.toBarChartItems(dimensionResult.rows),
		};
	}

	private async getDspEstimateBarChartV2(
		dimension: 'gender' | 'age_group',
		dto: DemographicsAggregateChartQueryDto,
		tenantId: string,
	): Promise<DemographicsBarChartResponse> {
		this.assertValidDateRange(dto);
		const key = this.cache.buildKey(
			`demographics:dsp-${dimension}-v2`,
			tenantId,
			dto,
		);
		return this.cache.wrap(key, async () => {
			if (!(await this.shouldQueryVevoDemographicsV2(dto))) {
				return { totalViews: 0, coverage: null, items: [] };
			}
			const [dimensionResult, deviceResult] = await Promise.all([
				this.queryDimensionV2(dimension, dto, tenantId),
				this.queryDimensionV2('device', dto, tenantId),
			]);
			this.sortRows(dimensionResult.rows, dimension, false);
			return {
				totalViews: dimensionResult.total,
				coverage:
					deviceResult.total > 0
						? Math.round(
								(dimensionResult.total / deviceResult.total) *
									10000,
							) / 10000
						: null,
				items: this.toBarChartItems(dimensionResult.rows),
			};
		});
	}

	/**
	 * Cube demographics is Vevo-only. Skip the DSP lookup unless the caller
	 * sent pgDspId/dspReportId — then empty unless that DSP is Vevo.
	 */
	private async shouldQueryVevoDemographics(
		dto: VevoDemographicsBarChartQueryDto,
	): Promise<boolean> {
		if (!dto.pgDspId && !dto.dspReportId) return true;
		const clauses: string[] = [];
		const params: Record<string, string> = {};
		if (dto.pgDspId) {
			clauses.push('pg_uuid = {pgDspId:String}');
			params.pgDspId = dto.pgDspId;
		}
		if (dto.dspReportId) {
			clauses.push('id_dsps_report = {dspReportId:String}');
			params.dspReportId = dto.dspReportId;
		}
		const rows = await this.clickHouseService.query<{ dsp_name: string }>(
			`SELECT dsp_name
       FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL
       WHERE ${clauses.join(' OR ')}
       LIMIT 5`,
			params,
		);
		if (rows.length === 0) return false;
		return rows.some((row) => /vevo|vvo/i.test(row.dsp_name || ''));
	}

	private async shouldQueryVevoDemographicsV2(
		dto: DemographicsAggregateChartQueryDto,
	): Promise<boolean> {
		const dspIds = dto.filters?.dspIds ?? [];
		if (!dspIds.length) return true;

		const params: Record<string, string | string[]> = {};
		const predicates = dspIds.map((dsp, index) => {
			if (dsp.pgDspId) {
				params[`pgDspId${index}`] = dsp.pgDspId;
				return `pg_uuid = {pgDspId${index}:String}`;
			}
			params[`dspReportIds${index}`] = dsp.dspReportIds ?? [];
			return `id_dsps_report IN ({dspReportIds${index}:Array(String)})`;
		});
		const rows = await this.clickHouseService.query<{ dsp_name: string }>(
			`SELECT dsp_name
       FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL
       WHERE ${predicates.join(' OR ')}`,
			params,
		);
		return rows.some((row) => /vevo|vvo/i.test(row.dsp_name || ''));
	}

	private async computeEstimateBreakdown(
		dimension: 'gender' | 'age_group',
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<DemographicsEstimateResponse> {
		const groupByTerritory = dto.groupByTerritory === true;
		const [dimensionResult, deviceResult] = await Promise.all([
			this.queryDimension(dimension, dto, tenantId, isrc),
			this.queryDimension('device', dto, tenantId, isrc),
		]);

		this.sortRows(dimensionResult.rows, dimension, groupByTerritory);

		const totalViewsEstimate = dimensionResult.total;
		return {
			totalViewsEstimate,
			coverage:
				deviceResult.total > 0
					? Math.round(
							(totalViewsEstimate / deviceResult.total) * 10000,
						) / 10000
					: null,
			items: this.toBreakdownItems(dimensionResult.rows, groupByTerritory),
		};
	}

	private async queryDimension(
		dimension: string,
		dto: DemographicsQueryDto | VevoDemographicsBarChartQueryDto,
		tenantId: string,
		isrc?: string,
	): Promise<{ rows: AggregatedRow[]; total: number }> {
		const { joinSql, filterSql, params } = this.buildTrackFilters(
			tenantId,
			dto,
		);
		params.dimension = dimension;
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const groupByTerritory =
			(dto as DemographicsQueryDto).groupByTerritory === true;
		const territorySelect = groupByTerritory ? 's.territory_code, ' : '';
		let extraFilters = '';
		if (isrc) {
			extraFilters += ' AND s.isrc = {isrc:String}';
			params.isrc = isrc;
		}
		const territoryCode = (dto as DemographicsQueryDto).territoryCode;
		if (territoryCode) {
			extraFilters += ' AND s.territory_code = {territoryCode:String}';
			params.territoryCode = territoryCode;
		}

		const sql = `
      SELECT
          ${territorySelect}s.dimension_value AS dimension_value,
          sum(s.views) AS views
      FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DEMOGRAPHICS_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        AND s.dimension = {dimension:String}
        ${extraFilters}
        ${filterSql}
      GROUP BY ${territorySelect}s.dimension_value
    `;

		const cubeRows =
			await this.clickHouseService.query<DemographicsCubeRow>(
				sql,
				params,
			);
		const rows = cubeRows.map((row) => ({
			territoryCode: row.territory_code ?? '',
			dimensionValue: row.dimension_value,
			views: Number(row.views),
		}));
		const total = rows.reduce((sum, row) => sum + row.views, 0);
		return { rows, total };
	}

	private async queryDimensionV2(
		dimension: string,
		dto: DemographicsAggregateChartQueryDto,
		tenantId: string,
	): Promise<{ rows: AggregatedRow[]; total: number }> {
		// trends_demographics_cube has no dsp_id. DSP pair filtering is handled
		// above as a Vevo eligibility check; the remaining fields share the
		// exact fact-filter logic used by trend V2 line/summary/bar endpoints.
		const { dspIds: _dspIds, ...nonDspFilters } =
			dto.filters ?? ({} as AnalyticsFilterSetDto);
		const { joinSql, filterSql, params } = buildAnalyticsFactFilters(
			tenantId,
			{
				filters: nonDspFilters as AnalyticsFilterSetDto,
				releaseType: dto.releaseType,
				analyticsVideoScope: dto.analyticsVideoScope,
			},
			'trend',
		);
		params.dimension = dimension;
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const cubeRows = await this.clickHouseService.query<DemographicsCubeRow>(
			`
				SELECT
					s.dimension_value AS dimension_value,
					sum(s.views) AS views
				FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DEMOGRAPHICS_CUBE} s
				${joinSql}
				WHERE s.reporting_date >= toDate({from:String})
					AND s.reporting_date <= toDate({to:String})
					AND s.dimension = {dimension:String}
					${filterSql}
				GROUP BY s.dimension_value
			`,
			params,
		);
		const rows = cubeRows.map((row) => ({
			territoryCode: '',
			dimensionValue: row.dimension_value,
			views: Number(row.views),
		}));
		return {
			rows,
			total: rows.reduce((sum, row) => sum + row.views, 0),
		};
	}

	// ─────────────────────────────────────────────────────
	// Helper: JOIN + WHERE scoped theo track + tenant
	// (replicate track-case của EntityAnalyticsService.buildEntityFilters)
	// ─────────────────────────────────────────────────────

	private buildTrackFilters(
		tenantId: string,
		dto: DemographicsQueryDto | VevoDemographicsBarChartQueryDto,
	): { joinSql: string; filterSql: string; params: Record<string, any> } {
		const analyticsScope = getAnalyticsVideoScope(dto);
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {};
		const chartDto = dto as VevoDemographicsBarChartQueryDto;
		const needsTrackJoin = !!(
			dto.releaseType ||
			chartDto.channelId ||
			chartDto.releaseId ||
			chartDto.labelId ||
			chartDto.artistId ||
			analyticsScope?.allowedChannelIds !== undefined
		);

		// System tenant không cần join nếu không filter entity / release_type / video scope
		if (isSystem && !needsTrackJoin) {
			let filterSql = '';
			if ('importSource' in dto && dto.importSource) {
				filterSql += ' AND s.import_source = {importSource:String}';
				params.importSource = dto.importSource;
			}
			return { joinSql: '', filterSql, params };
		}

		const joinSql = `
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      ${buildOwnershipJoin('trend', 's.reporting_date')}`;
		let filterSql = `AND t.is_deleted = 0
      AND ${getOwnershipLedgerFallbackPredicate()}`;

		if (!isSystem) {
			filterSql +=
				" AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {tenantId:String}";
			params.tenantId = tenantId;
		}

		if (dto.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = dto.releaseType;
		}

		if (chartDto.channelId) {
			filterSql += ' AND t.channel_id = {channelId:String}';
			params.channelId = chartDto.channelId;
		}

		if (chartDto.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = chartDto.releaseId;
		}

		if (chartDto.labelId) {
			filterSql +=
				" AND coalesce(nullIf(o.label_id, ''), t.label_id) = {labelId:String}";
			params.labelId = chartDto.labelId;
		}

		if (chartDto.artistId) {
			filterSql += ' AND has(t.artist_ids, {artistId:String})';
			params.artistId = chartDto.artistId;
		}

		if ('importSource' in dto && dto.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = dto.importSource;
		}

		filterSql = appendAnalyticsVideoScopeFilter(
			filterSql,
			params,
			analyticsScope,
			't',
			chartDto.channelId,
		);

		return { joinSql, filterSql, params };
	}

	private assertValidDateRange(dto: {
		fromDate: string;
		toDate: string;
	}): void {
		if (dto.fromDate > dto.toDate) {
			throw new BadRequestException(
				'fromDate must be before or equal to toDate',
			);
		}
	}

	// ─────────────────────────────────────────────────────
	// Sort + percent
	// ─────────────────────────────────────────────────────

	private sortRows(
		rows: AggregatedRow[],
		dimension: string,
		groupByTerritory: boolean,
	): void {
		const byValue = (a: AggregatedRow, b: AggregatedRow): number =>
			dimension === 'age_group'
				? this.compareAge(a, b)
				: b.views - a.views;
		if (!groupByTerritory) {
			rows.sort(byValue);
			return;
		}
		rows.sort(
			(a, b) =>
				a.territoryCode.localeCompare(b.territoryCode) || byValue(a, b),
		);
	}

	private compareAge(a: AggregatedRow, b: AggregatedRow): number {
		const indexA = AGE_ORDER.indexOf(a.dimensionValue);
		const indexB = AGE_ORDER.indexOf(b.dimensionValue);
		const orderA = indexA === -1 ? AGE_ORDER.length : indexA;
		const orderB = indexB === -1 ? AGE_ORDER.length : indexB;
		if (orderA !== orderB) return orderA - orderB;
		return b.views - a.views;
	}

	private toBarChartItems(rows: AggregatedRow[]): DemographicsBarChartItem[] {
		const percents = this.computePercents(rows.map((row) => row.views));
		return rows.map((row, index) => ({
			label: row.dimensionValue,
			dimensionValue: row.dimensionValue,
			totalViews: row.views,
			percent: percents[index],
		}));
	}

	private toBreakdownItems(
		rows: AggregatedRow[],
		groupByTerritory: boolean,
	): DemographicsBreakdownItem[] {
		if (!groupByTerritory) {
			const percents = this.computePercents(rows.map((row) => row.views));
			return rows.map((row, index) => ({
				dimensionValue: row.dimensionValue,
				views: row.views,
				percent: percents[index],
			}));
		}

		const grouped = new Map<string, AggregatedRow[]>();
		for (const row of rows) {
			const group = grouped.get(row.territoryCode);
			if (group) group.push(row);
			else grouped.set(row.territoryCode, [row]);
		}

		const items: DemographicsBreakdownItem[] = [];
		for (const [territoryCode, groupRows] of grouped) {
			const percents = this.computePercents(
				groupRows.map((row) => row.views),
			);
			groupRows.forEach((row, index) => {
				items.push({
					territoryCode,
					dimensionValue: row.dimensionValue,
					views: row.views,
					percent: percents[index],
				});
			});
		}
		return items;
	}

	/** Làm tròn 2 chữ số thập phân; phần dư được cộng vào bucket lớn nhất để tổng đúng 100. */
	private computePercents(views: number[]): number[] {
		const total = views.reduce((sum, value) => sum + value, 0);
		if (total === 0) return views.map(() => 0);

		const rounded = views.map(
			(value) => Math.round((value / total) * 10000) / 100,
		);
		const residual =
			Math.round((100 - rounded.reduce((sum, value) => sum + value, 0)) * 100) /
			100;
		if (residual !== 0 && rounded.length > 0) {
			let maxIndex = 0;
			for (let i = 1; i < views.length; i++) {
				if (views[i] > views[maxIndex]) maxIndex = i;
			}
			rounded[maxIndex] =
				Math.round((rounded[maxIndex] + residual) * 100) / 100;
		}
		return rounded;
	}
}
