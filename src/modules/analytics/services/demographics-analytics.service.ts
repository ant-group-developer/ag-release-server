import { Injectable } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { DemographicsQueryDto } from '../dto/analytics-query.dto';
import { buildOwnershipJoin } from '../utils/ownership-join.util';
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
				isrc,
				dto,
				tenantId,
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

	// ─────────────────────────────────────────────────────
	// Compute
	// ─────────────────────────────────────────────────────

	private async computeEstimateBreakdown(
		dimension: 'gender' | 'age_group',
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<DemographicsEstimateResponse> {
		const groupByTerritory = dto.groupByTerritory === true;
		const [dimensionResult, deviceResult] = await Promise.all([
			this.queryDimension(dimension, isrc, dto, tenantId),
			this.queryDimension('device', isrc, dto, tenantId),
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
		isrc: string,
		dto: DemographicsQueryDto,
		tenantId: string,
	): Promise<{ rows: AggregatedRow[]; total: number }> {
		const { joinSql, filterSql, params } = this.buildTrackFilters(
			tenantId,
			dto,
		);
		params.isrc = isrc;
		params.dimension = dimension;
		params.from = dto.fromDate;
		params.to = dto.toDate;

		const groupByTerritory = dto.groupByTerritory === true;
		const territorySelect = groupByTerritory ? 's.territory_code, ' : '';
		let territoryFilter = '';
		if (dto.territoryCode) {
			territoryFilter = ' AND s.territory_code = {territoryCode:String}';
			params.territoryCode = dto.territoryCode;
		}

		const sql = `
      SELECT
          ${territorySelect}s.dimension_value AS dimension_value,
          sum(s.views) AS views
      FROM music_analytics.${CLICKHOUSE_TABLES.TRENDS_DEMOGRAPHICS_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        AND s.isrc = {isrc:String}
        AND s.dimension = {dimension:String}
        ${territoryFilter}
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

	// ─────────────────────────────────────────────────────
	// Helper: JOIN + WHERE scoped theo track + tenant
	// (replicate track-case của EntityAnalyticsService.buildEntityFilters)
	// ─────────────────────────────────────────────────────

	private buildTrackFilters(
		tenantId: string,
		dto: DemographicsQueryDto,
	): { joinSql: string; filterSql: string; params: Record<string, any> } {
		const analyticsScope = getAnalyticsVideoScope(dto);
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {};

		// System tenant không cần join nếu không filter release_type / video scope
		if (
			isSystem &&
			!dto.releaseType &&
			analyticsScope?.allowedChannelIds === undefined
		) {
			let filterSql = '';
			if (dto.importSource) {
				filterSql += ' AND s.import_source = {importSource:String}';
				params.importSource = dto.importSource;
			}
			return { joinSql: '', filterSql, params };
		}

		const joinSql = `
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      ${buildOwnershipJoin('trend', 's.reporting_date')}`;
		let filterSql = `AND t.is_deleted = 0
      AND (o.isrc != '' OR s.isrc NOT IN (SELECT isrc FROM music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC} FINAL))`;

		if (!isSystem) {
			filterSql +=
				" AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {tenantId:String}";
			params.tenantId = tenantId;
		}

		if (dto.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = dto.releaseType;
		}

		if (dto.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = dto.importSource;
		}

		filterSql = appendAnalyticsVideoScopeFilter(
			filterSql,
			params,
			analyticsScope,
		);

		return { joinSql, filterSql, params };
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
