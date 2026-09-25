import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';
import { AnalyticsRankingEntityType } from '../dto/analytics-query.dto';
import {
	ArtistRankingItem,
	ChannelRankingItem,
	DspRankingItem,
	LabelRankingItem,
	ReleaseRankingItem,
	ReleaseRankingVideoItem,
	RevenueArtistItem,
	RevenueChannelItem,
	RevenueDspItem,
	RevenueLabelItem,
	RevenueReleaseItem,
	RevenueReleaseVideoItem,
	RevenueSourceTypeItem,
	RevenueTenantItem,
	RevenueTrackItem,
	SourceBreakdownItem,
	SourceTypeRankingItem,
	TenantRankingItem,
	TrackRankingItem,
} from '../interfaces/analytics.interface';
import { AnalyticsRankingV2Item } from '../interfaces/analytics-ranking-v2.interface';

function coverImage(cover?: ICoverArtThumbnails | null): string | null {
	if (!cover) return null;
	return (
		cover['300x300'] ||
		cover['160x160'] ||
		cover['100x100'] ||
		cover['75x75'] ||
		cover.original ||
		null
	);
}

function trendMetrics(trendViews: number) {
	return {
		trendViews,
		usage: null,
		revenueUsd: null,
		revenueUsdExact: null,
	};
}

function salesMetrics(
	usage: number,
	revenueUsd: number,
	revenueUsdExact?: string,
) {
	return {
		trendViews: null,
		usage,
		revenueUsd,
		revenueUsdExact: revenueUsdExact ?? String(revenueUsd),
	};
}

function item(
	rank: number,
	entity: AnalyticsRankingV2Item['entity'],
	metrics: AnalyticsRankingV2Item['metrics'],
	bySource?: SourceBreakdownItem[],
): AnalyticsRankingV2Item {
	return { rank, entity, metrics, bySource: bySource ?? [] };
}

export function mapTrendRankingItem(
	entityType: AnalyticsRankingEntityType,
	row:
		| TrackRankingItem
		| ReleaseRankingItem
		| ReleaseRankingVideoItem
		| ArtistRankingItem
		| LabelRankingItem
		| TenantRankingItem
		| ChannelRankingItem
		| DspRankingItem
		| SourceTypeRankingItem,
): AnalyticsRankingV2Item {
	switch (entityType) {
		case 'track': {
			const track = row as TrackRankingItem;
			return item(
				track.rank,
				{
					id: track.isrc,
					type: 'track',
					name: track.title,
					imageUrl: coverImage(track.release?.coverArtThumbnails),
					subtitle: track.artistName,
					isrc: track.isrc,
					releaseId: track.releaseId,
				},
				trendMetrics(track.totalViews),
				track.bySource,
			);
		}
		case 'release': {
			const release = row as ReleaseRankingItem;
			return item(
				release.rank,
				{
					id: release.releaseId,
					type: 'release',
					name: release.title,
					imageUrl: coverImage(release.release?.coverArtThumbnails),
					subtitle: release.labelName,
					releaseId: release.releaseId,
					upc: release.upc,
				},
				trendMetrics(release.totalViews),
				release.bySource,
			);
		}
		case 'releaseVideo': {
			const release = row as ReleaseRankingVideoItem;
			return item(
				release.rank,
				{
					id: release.releaseId,
					type: 'releaseVideo',
					name: release.title,
					imageUrl: coverImage(release.release?.coverArtThumbnails),
					subtitle: release.channels?.[0]?.name ?? release.labelName,
					releaseId: release.releaseId,
					upc: release.upc,
				},
				trendMetrics(release.totalViews),
				release.bySource,
			);
		}
		case 'artist': {
			const artist = row as ArtistRankingItem;
			return item(
				artist.rank,
				{
					id: artist.artistId,
					type: 'artist',
					name: artist.artistName,
					imageUrl: artist.image ?? artist.picture,
					subtitle: artist.country,
				},
				trendMetrics(artist.totalViews),
				artist.bySource,
			);
		}
		case 'label': {
			const label = row as LabelRankingItem;
			return item(
				label.rank,
				{
					id: label.labelId,
					type: 'label',
					name: label.labelName,
					imageUrl: label.image ?? label.picture,
					subtitle: label.tenant?.name ?? null,
					tenantId: label.tenant?.id ?? null,
				},
				trendMetrics(label.totalViews),
				label.bySource,
			);
		}
		case 'tenant': {
			const tenant = row as TenantRankingItem;
			return item(
				tenant.rank,
				{
					id: tenant.tenantId,
					type: 'tenant',
					name: tenant.tenantName,
					imageUrl: tenant.logo,
					subtitle: tenant.type,
				},
				trendMetrics(tenant.totalViews),
				tenant.bySource,
			);
		}
		case 'channel': {
			const channel = row as ChannelRankingItem;
			return item(
				channel.rank,
				{
					id: channel.channelId,
					type: 'channel',
					name: channel.channelName,
					imageUrl: channel.thumbUrl,
					subtitle: channel.youtubeChannelId,
					tenantId: channel.tenant?.id ?? null,
				},
				trendMetrics(channel.totalViews),
				channel.bySource,
			);
		}
		case 'dsp': {
			const dsp = row as DspRankingItem;
			return item(
				dsp.rank,
				{
					id: dsp.dspReportId,
					type: 'dsp',
					name: dsp.dspName,
					imageUrl: dsp.imageUrl,
					subtitle: dsp.pgDspId,
					pgDspId: dsp.pgDspId,
					dspReportId: dsp.dspReportId,
				},
				trendMetrics(dsp.totalViews),
				dsp.bySource,
			);
		}
		case 'sourceType': {
			const source = row as SourceTypeRankingItem;
			return item(
				source.rank,
				{
					id: source.sourceType,
					type: 'sourceType',
					name: source.sourceTypeLabel,
					imageUrl: source.imageUrl,
					subtitle: source.sourceType,
				},
				trendMetrics(source.totalViews),
			);
		}
		default:
			return item(0, emptyEntity(entityType), trendMetrics(0));
	}
}

export function mapSalesRankingItem(
	entityType: AnalyticsRankingEntityType,
	row:
		| RevenueTrackItem
		| RevenueReleaseItem
		| RevenueReleaseVideoItem
		| RevenueArtistItem
		| RevenueLabelItem
		| RevenueTenantItem
		| RevenueChannelItem
		| RevenueDspItem
		| RevenueSourceTypeItem,
): AnalyticsRankingV2Item {
	switch (entityType) {
		case 'track': {
			const track = row as RevenueTrackItem;
			return item(
				track.rank,
				{
					id: track.isrc,
					type: 'track',
					name: track.title,
					imageUrl: null,
					subtitle: track.artistName,
					isrc: track.isrc,
					releaseId: track.releaseId,
				},
				salesMetrics(
					track.quantity,
					track.revenueUsd,
					track.revenueUsdExact,
				),
				track.bySource,
			);
		}
		case 'release': {
			const release = row as RevenueReleaseItem;
			return item(
				release.rank,
				{
					id: release.releaseId,
					type: 'release',
					name: release.title,
					imageUrl: coverImage(release.release?.coverArtThumbnails),
					subtitle: release.labelName,
					releaseId: release.releaseId,
					upc: release.upc,
				},
				salesMetrics(
					release.quantity,
					release.revenueUsd,
					release.revenueUsdExact,
				),
				release.bySource,
			);
		}
		case 'releaseVideo': {
			const release = row as RevenueReleaseVideoItem;
			return item(
				release.rank,
				{
					id: release.releaseId,
					type: 'releaseVideo',
					name: release.title,
					imageUrl: coverImage(release.release?.coverArtThumbnails),
					subtitle: release.channels?.[0]?.name ?? release.labelName,
					releaseId: release.releaseId,
					upc: release.upc,
				},
				salesMetrics(
					release.quantity,
					release.revenueUsd,
					release.revenueUsdExact,
				),
				release.bySource,
			);
		}
		case 'artist': {
			const artist = row as RevenueArtistItem;
			return item(
				artist.rank,
				{
					id: artist.artistId,
					type: 'artist',
					name: artist.artistName,
					imageUrl: artist.picture,
					subtitle: artist.country,
				},
				salesMetrics(
					artist.quantity,
					artist.revenueUsd,
					artist.revenueUsdExact,
				),
				artist.bySource,
			);
		}
		case 'label': {
			const label = row as RevenueLabelItem;
			return item(
				label.rank,
				{
					id: label.labelId,
					type: 'label',
					name: label.labelName,
					imageUrl: label.picture,
					subtitle: label.tenant?.name ?? null,
					tenantId: label.tenant?.id ?? null,
				},
				salesMetrics(
					label.quantity,
					label.revenueUsd,
					label.revenueUsdExact,
				),
				label.bySource,
			);
		}
		case 'tenant': {
			const tenant = row as RevenueTenantItem;
			return item(
				tenant.rank,
				{
					id: tenant.tenantId,
					type: 'tenant',
					name: tenant.tenantName,
					imageUrl: tenant.logo,
					subtitle: tenant.type,
				},
				salesMetrics(
					tenant.quantity,
					tenant.revenueUsd,
					tenant.revenueUsdExact,
				),
				tenant.bySource,
			);
		}
		case 'channel': {
			const channel = row as RevenueChannelItem;
			return item(
				channel.rank,
				{
					id: channel.channelId,
					type: 'channel',
					name: channel.channelName,
					imageUrl: channel.thumbUrl,
					subtitle: channel.youtubeChannelId,
					tenantId: channel.tenant?.id ?? null,
				},
				salesMetrics(
					channel.quantity,
					channel.revenueUsd,
					channel.revenueUsdExact,
				),
				channel.bySource,
			);
		}
		case 'dsp': {
			const dsp = row as RevenueDspItem & { rank?: number };
			return item(
				dsp.rank ?? 0,
				{
					id: dsp.dspReportId,
					type: 'dsp',
					name: dsp.dspName,
					imageUrl: dsp.imageUrl,
					subtitle: dsp.pgDspId,
					pgDspId: dsp.pgDspId,
					dspReportId: dsp.dspReportId,
				},
				salesMetrics(dsp.quantity, dsp.revenueUsd, dsp.revenueUsdExact),
				dsp.bySource,
			);
		}
		case 'sourceType': {
			const source = row as RevenueSourceTypeItem;
			return item(
				source.rank,
				{
					id: source.sourceType,
					type: 'sourceType',
					name: source.sourceTypeLabel,
					imageUrl: source.imageUrl,
					subtitle: source.sourceType,
				},
				salesMetrics(
					source.quantity,
					source.revenueUsd,
					source.revenueUsdExact,
				),
			);
		}
		default:
			return item(
				0,
				emptyEntity(entityType),
				salesMetrics(0, 0, '0'),
			);
	}
}

function emptyEntity(
	type: AnalyticsRankingEntityType,
): AnalyticsRankingV2Item['entity'] {
	return { id: '', type, name: '', imageUrl: null };
}
