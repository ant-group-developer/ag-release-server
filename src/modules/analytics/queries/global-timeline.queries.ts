import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';

export function getRevenueOverviewQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity)     AS total_quantity,
      sum(s.total_revenue_usd) AS total_revenue_usd,
      uniq(s.territory_code)   AS total_territories
    FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

/** Uses the fact table when a DSP filter is present because the territory cube has no dsp_id dimension. */
export function getRevenueOverviewWithDspQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.quantity) AS total_quantity,
      toString(sum(
        if(
          s.revenue_usd != 0,
          s.revenue_usd,
          divideDecimal(
            s.revenue_local,
            if(
              toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
              toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
              toDecimal128(1, 18)
            ),
            18
          )
        )
      )) AS total_revenue_usd,
      uniq(s.territory_code) AS total_territories
    FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT} s
    ${joinSql}
    LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
      ON formatDateTime(s.reporting_period_start, '%Y-%m') = er.rate_month
      AND s.revenue_currency = er.currency
    WHERE s.reporting_period_start >= toDate({from:String})
      AND s.reporting_period_start <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopDspCountQuery(
	joinSql: string,
	joinExpr: string,
	filterSql: string,
	dspGroupKey: string,
): string {
	return `
    SELECT uniq(${dspGroupKey}) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopDspQuery(
	joinSql: string,
	joinExpr: string,
	filterSql: string,
	resolvedDspName: string,
	dspGroupKey: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      nullIf(any(r.pg_uuid), '') AS pg_dsp_id,
      arrayElement(arraySort(groupUniqArray(s.dsp_id)), 1) AS dsp_report_id,
      arraySort(groupUniqArray(s.dsp_id)) AS dsp_report_ids,
      any(${resolvedDspName}) AS dsp_name,
      any(p.picture) AS image_url,
      sum(s.total_quantity) AS quantity,
      sum(s.total_revenue_usd) AS revenue_usd
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY ${dspGroupKey}
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopDspTotalQuery(
	joinSql: string,
	joinExpr: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopArtistCountQuery(
	joinSql: string,
	filterSql: string,
	hasKeywordFilter: boolean,
): string {
	return `
    SELECT uniq(artistId) AS total
    FROM (
      SELECT arrayJoin(t.artist_ids) AS artistId
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
    )
    WHERE artistId != '' ${hasKeywordFilter ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
  `;
}

export function getRevenueTopArtistQuery(
	joinSql: string,
	filterSql: string,
	hasKeywordFilter: boolean,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      arrayJoin(t.artist_ids) AS artistId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      uniq(s.isrc) AS track_count
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY artistId
    HAVING artistId != '' ${hasKeywordFilter ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopArtistTotalQuery(
	joinSql: string,
	filterSql: string,
	hasKeywordFilter: boolean,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
      ${hasKeywordFilter ? `AND hasAny(t.artist_ids, {matchedArtistIds:Array(String)})` : ''}
  `;
}

export function getRevenueTopTrackCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	// Video bypass filter ISRC (video ISRC luon hop le, khong phai placeholder UPC-xxx).
	return `
    SELECT uniq(s.isrc) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND (t.release_type = 'video' OR s.isrc NOT LIKE 'UPC-%')
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTrackQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	// Video bypass filter ISRC (video ISRC luon hop le, khong phai placeholder UPC-xxx).
	return `
    SELECT
      s.isrc AS isrc,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      any(t.track_title) AS trackTitle,
      any(t.track_version) AS trackVersion,
      any(t.release_id) AS releaseId,
      any(t.release_title) AS releaseTitle,
      any(t.label_id) AS labelId,
      any(t.label_name) AS labelName,
      any(t.tenant_id) AS tenantId,
      any(t.artist_names) AS artistNames,
      any(t.track_metadata_spotify) AS trackMetadataSpotify,
      any(t.track_metadata_deezer) AS trackMetadataDeezer,
      any(t.release_metadata_spotify) AS releaseMetadataSpotify,
      any(t.release_metadata_deezer) AS releaseMetadataDeezer
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND (t.release_type = 'video' OR s.isrc NOT LIKE 'UPC-%')
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY isrc
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopTrackFallbackQuery(): string {
	return `
    SELECT
      isrc,
      any(track_title) AS track_title,
      any(artist_name) AS artist_name
    FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT}
    WHERE isrc IN ({isrcs:Array(String)})
    GROUP BY isrc
  `;
}

export function getRevenueTopTrackTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	// Video bypass filter ISRC (video ISRC luon hop le, khong phai placeholder UPC-xxx).
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND (t.release_type = 'video' OR s.isrc NOT LIKE 'UPC-%')
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopLabelCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(coalesce(nullIf(o.label_id, ''), t.label_id)) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.label_id, ''), t.label_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopLabelQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      coalesce(nullIf(o.label_id, ''), t.label_id) AS labelId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      uniq(t.release_id) AS release_count,
      uniq(t.isrc) AS track_count
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.label_id, ''), t.label_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY labelId
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopLabelTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.label_id, ''), t.label_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopChannelCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(t.channel_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.channel_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopChannelQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      t.channel_id AS channelId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      uniq(t.release_id) AS release_count,
      uniq(t.isrc) AS track_count
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.channel_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY channelId
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopChannelTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.channel_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTenantCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(coalesce(nullIf(o.tenant_id, ''), t.tenant_id)) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTenantQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      coalesce(nullIf(o.tenant_id, ''), t.tenant_id) AS tenantId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY tenantId
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopTenantTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND coalesce(nullIf(o.tenant_id, ''), t.tenant_id) != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopSourceTypeCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(s.import_source) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopSourceTypeQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      s.import_source AS sourceType,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY sourceType
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopSourceTypeTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(t.release_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	// anyIf skips the UPC-{upc} placeholder row in pg_tracks_sync (empty
	// title/label/covers). Album-level UPC sales still count in the sums.
	return `
    SELECT
      t.release_id AS releaseId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      uniqIf(s.isrc, s.isrc NOT LIKE 'UPC-%') AS trackCount,
      anyIf(t.release_title, t.release_title != '') AS releaseTitle,
      anyIf(t.release_upc, t.release_upc != '') AS releaseUpc,
      anyIf(t.label_id, t.label_id != '') AS labelId,
      anyIf(t.label_name, t.label_name != '') AS labelName,
      anyIf(t.tenant_id, t.tenant_id != '') AS tenantId,
      anyIf(t.cover_75, t.cover_75 != '') AS cover75,
      anyIf(t.cover_100, t.cover_100 != '') AS cover100,
      anyIf(t.cover_160, t.cover_160 != '') AS cover160,
      anyIf(t.cover_300, t.cover_300 != '') AS cover300,
      anyIf(t.cover_original, t.cover_original != '') AS coverOriginal,
      anyIf(t.release_metadata_spotify, t.release_metadata_spotify != '') AS releaseMetadataSpotify,
      anyIf(t.release_metadata_deezer, t.release_metadata_deezer != '') AS releaseMetadataDeezer
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY releaseId
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopReleaseTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseVideoCountQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(t.release_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND t.release_type = 'video'
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseVideoQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
	limit: number,
	offset: number,
): string {
	return `
    SELECT
      t.release_id AS releaseId,
      groupUniqArray(20)(t.channel_id) AS channelIds,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND t.release_type = 'video'
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY releaseId
    ORDER BY ${orderBy} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopReleaseVideoTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND t.release_type = 'video'
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendsOverviewMainQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_quantity) AS total_views,
      uniq(s.dsp_id) AS total_dsps,
      uniq(s.isrc) AS total_tracks,
      uniq(t.label_id) AS total_labels
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendsOverviewArtistQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT uniq(artist_id) AS total_artists
    FROM (
      SELECT arrayJoin(t.artist_ids) AS artist_id
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE 1=1
        AND s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        ${filterSql}
    )
    WHERE artist_id != ''
  `;
}

export function getTrendViewLineChartQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      formatDateTime(s.reporting_date, '%Y-%m-%d') AS period,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
    GROUP BY s.reporting_date, period
    ORDER BY s.reporting_date ASC
  `;
}

export function getTrendViewDspBarChartTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendViewDspBarChartQuery(
	joinSql: string,
	filterSql: string,
	resolvedDspName: string,
	joinExpr: string,
): string {
	return `
    SELECT
      nullIf(any(r.pg_uuid), '') AS pg_dsp_id,
      arrayElement(arraySort(groupUniqArray(s.dsp_id)), 1) AS dsp_report_id,
      arraySort(groupUniqArray(s.dsp_id)) AS dsp_report_ids,
      any(${resolvedDspName}) AS dsp_name,
      any(p.picture) AS image_url,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
    GROUP BY if(empty(ifNull(r.pg_uuid, '')), concat('report:', s.dsp_id), concat('pg:', r.pg_uuid)) AS dsp_group_key
    ORDER BY total_views DESC, dsp_group_key ASC
    LIMIT 5
  `;
}

export function getRevenueLineChartQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      formatDateTime(s.period, '%Y-%m') AS period,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY period
    ORDER BY period ASC
  `;
}

export function getTrendViewTerritoryBarChartTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_TER_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendViewTerritoryBarChartQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      s.territory_code AS territory,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_TER_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
    GROUP BY territory
    ORDER BY total_views DESC
    LIMIT 5
  `;
}

export function getRevenueDspBarChartTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_revenue_usd) AS total_rev,
      sum(s.total_quantity) AS total_qty
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueDspBarChartQuery(
	joinSql: string,
	joinExpr: string,
	filterSql: string,
	resolvedDspName: string,
	orderBy: 'revenue_usd' | 'quantity',
): string {
	return `
    SELECT
      nullIf(any(r.pg_uuid), '') AS pg_dsp_id,
      arrayElement(arraySort(groupUniqArray(s.dsp_id)), 1) AS dsp_report_id,
      arraySort(groupUniqArray(s.dsp_id)) AS dsp_report_ids,
      any(${resolvedDspName}) AS dsp_name,
      any(p.picture) AS image_url,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY if(empty(ifNull(r.pg_uuid, '')), concat('report:', s.dsp_id), concat('pg:', r.pg_uuid)) AS dsp_group_key
    ORDER BY ${orderBy} DESC, dsp_group_key ASC
    LIMIT 5
  `;
}

export function getRevenueTerritoryBarChartTotalQuery(
	joinSql: string,
	filterSql: string,
): string {
	return `
    SELECT
      sum(s.total_revenue_usd) AS total_rev,
      sum(s.total_quantity) AS total_qty
    FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTerritoryBarChartQuery(
	joinSql: string,
	filterSql: string,
	orderBy: 'revenue_usd' | 'quantity',
): string {
	return `
    SELECT
      s.territory_code AS territory,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY territory
    ORDER BY ${orderBy} DESC, territory ASC
    LIMIT 5
  `;
}
