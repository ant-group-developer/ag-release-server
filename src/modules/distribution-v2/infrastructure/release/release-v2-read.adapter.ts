import { Injectable } from '@nestjs/common';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { EntityManager } from 'typeorm';
import {
	DistributionV2AssetReadModel,
	DistributionV2DspDeliveryReadModel,
	DistributionV2ReleaseReadModel,
	DistributionV2ReleaseReadPort,
	DistributionV2TrackReadModel,
} from '../../application/distribution-v2-submit.types';
import { DistributionV2ChannelRoute } from '../../enums/distribution-v2.enum';

@Injectable()
export class ReleaseV2ReadAdapter implements DistributionV2ReleaseReadPort {
	async read(
		releaseId: string,
		manager: EntityManager,
	): Promise<DistributionV2ReleaseReadModel | null> {
		const release = await manager.getRepository(Release).findOne({
			where: { id: releaseId },
			relations: {
				tenant: { tenantTier: true },
				releaseLanguage: {
					audioLanguage: true,
					metadataLanguage: true,
					metadataLanguageCountry: true,
				},
				releaseTerritory: true,
				releaseCoverArts: { file: true },
				releaseArtists: { artist: true },
				releaseContributors: { artist: true, artistRole: true },
				tracks: {
					audioFile: { file: true, peak: true },
					trackArtists: { artist: true },
					trackContributors: { artist: true, artistRole: true },
					trackLanguage: {
						audioLanguage: true,
						metadataLanguage: true,
					},
				},
				video: {
					videoFile: true,
					channel: true,
					videoArtists: { artist: true },
					videoContributors: { artist: true, artistRole: true },
					videoGenres: { genre: true },
				},
				releaseDspDeliveries: {
					dsp: {
						dspRoutingConfig: {
							aggregator: true,
						},
					},
				},
			},
		});
		if (!release) return null;

		const tracks = (release.tracks ?? [])
			.slice()
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map<DistributionV2TrackReadModel>((track) => ({
				id: track.id,
				order: track.order ?? 0,
				title: track.title,
				isrc: track.isrc,
				fields: plainTrack(track),
				audio: track.audioFile
					? assetFromFileRelation(track.audioFile.file, {
							id: track.audioFile.id,
							fileId: track.audioFile.fileId,
							duration: track.audioFile.duration,
							sampleRate: track.audioFile.sampleRate,
							bitrate: track.audioFile.bitrate,
							bitDepth: track.audioFile.bitDepth,
						})
					: null,
			}));

		return {
			id: release.id,
			tenantId: release.tenantId,
			type: release.type,
			title: release.title,
			version: release.version,
			upc: release.upc,
			status: String(release.status),
			updatedAt: release.updatedAt,
			fields: plainRelease(release),
			tenantPolicy: {
				requiresManualReview: false,
				tenantType: release.tenant?.type ?? null,
				tenantTierId: release.tenant?.tenantTierId ?? null,
			},
			tracks,
			coverArts: (release.releaseCoverArts ?? []).map((cover) =>
				assetFromFileRelation(cover.file, {
					id: cover.id,
					fileId: cover.fileId,
					width: cover.width,
					height: cover.height,
					type: cover.type,
				}),
			),
			video: release.video ? plainVideo(release.video) : null,
			dspDeliveries: (release.releaseDspDeliveries ?? []).map(
				(delivery): DistributionV2DspDeliveryReadModel => ({
					id: delivery.id,
					dspId: delivery.dspId,
					dspCode: delivery.dsp?.code ?? delivery.dspId,
					dspActive: delivery.dsp?.isActive ?? true,
					isSelected: delivery.isSelected,
					status: delivery.status ?? null,
					hasLiveVersion: delivery.hasLiveVersion,
					route: routeFromDelivery(delivery),
					aggregatorCode:
						delivery.dsp?.dspRoutingConfig?.aggregator?.code ??
						null,
				}),
			),
		};
	}
}

function routeFromDelivery(
	delivery: Release['releaseDspDeliveries'][number],
): DistributionV2ChannelRoute {
	const mode = delivery.dsp?.dspRoutingConfig?.mode;
	if (String(mode).toLowerCase() === 'aggregator') {
		const code =
			delivery.dsp?.dspRoutingConfig?.aggregator?.code?.toUpperCase();
		if (code === 'CI') return DistributionV2ChannelRoute.CI;
		if (code === 'STATE51') return DistributionV2ChannelRoute.STATE51;
	}
	return DistributionV2ChannelRoute.DIRECT;
}

function assetFromFileRelation(
	file: any,
	fields: Record<string, unknown>,
): DistributionV2AssetReadModel {
	return {
		...fields,
		fileId: fields.fileId as string,
		fileName: file?.fileName ?? null,
		key: file?.key ?? null,
		bucket: file?.bucket ?? null,
		contentType: file?.contentType ?? null,
		extension: file?.extension ?? null,
		fileSize: file?.fileSize ?? null,
	};
}

function plainRelease(release: Release): Record<string, unknown> {
	return {
		id: release.id,
		type: release.type,
		upc: release.upc,
		albumFormatId: release.albumFormatId,
		primaryGenreId: release.primaryGenreId,
		subGenreId: release.subGenreId,
		labelId: release.labelId,
		title: release.title,
		version: release.version,
		status: release.status,
		cLineYear: release.cLineYear,
		cLineOwner: release.cLineOwner,
		pLineYear: release.pLineYear,
		pLineOwner: release.pLineOwner,
		catalogId: release.catalogId,
		isVariousArtist: release.isVariousArtist,
		isInstrumental: release.isInstrumental,
		releaseTimeMode: release.releaseTimeMode,
		releaseTimezoneId: release.releaseTimezoneId,
		releaseDate: release.releaseDate,
		releaseEndDate: release.releaseEndDate,
		releaseOriginalDate: release.releaseOriginalDate,
		releaseTime: release.releaseTime,
		metadataCi: release.metadataCi,
		metadataSpotify: release.metadataSpotify,
		metadataDeezer: release.metadataDeezer,
		releaseLanguage: release.releaseLanguage
			? plainValue(release.releaseLanguage)
			: null,
		releaseTerritory: release.releaseTerritory
			? plainValue(release.releaseTerritory)
			: null,
		releaseArtists: (release.releaseArtists ?? []).map(plainValue),
		releaseContributors: (release.releaseContributors ?? []).map(
			plainValue,
		),
	};
}

function plainTrack(track: Track): Record<string, unknown> {
	return {
		id: track.id,
		title: track.title,
		version: track.version,
		isrc: track.isrc,
		iswc: track.iswc,
		releaseId: track.releaseId,
		pLineYear: track.pLineYear,
		pLineOwner: track.pLineOwner,
		primaryGenreId: track.primaryGenreId,
		subGenreId: track.subGenreId,
		order: track.order,
		trackTypeId: track.trackTypeId,
		trackOriginTypeId: track.trackOriginTypeId,
		trackSensitiveId: track.trackSensitiveId,
		isByAi: track.isByAi,
		isInstrumental: track.isInstrumental,
		lyric: track.lyric,
		priceTierId: track.priceTierId,
		trackLanguage: track.trackLanguage
			? plainValue(track.trackLanguage)
			: null,
		trackArtists: (track.trackArtists ?? []).map(plainValue),
		trackContributors: (track.trackContributors ?? []).map(plainValue),
	};
}

function plainVideo(
	video: NonNullable<Release['video']>,
): Record<string, unknown> {
	return {
		id: video.id,
		releaseId: video.releaseId,
		isrc: video.isrc,
		externalId: video.externalId,
		label: video.label,
		labelId: video.labelId,
		explicit: video.explicit,
		aiContent: video.aiContent,
		channelId: video.channelId,
		description: video.description,
		keywords: video.keywords,
		madeForKids: video.madeForKids,
		visibility: video.visibility,
		contentProvider: video.contentProvider,
		copyrightOwner: video.copyrightOwner,
		partnerCustomId1: video.partnerCustomId1,
		partnerCustomId2: video.partnerCustomId2,
		fileId: video.fileId,
		videoArtists: (video.videoArtists ?? []).map(plainValue),
		videoContributors: (video.videoContributors ?? []).map(plainValue),
		videoGenres: (video.videoGenres ?? []).map(plainValue),
	};
}

function plainValue(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object') return {};
	const source = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(source).filter(
			([key, item]) =>
				![
					'release',
					'track',
					'artist',
					'dsp',
					'tenant',
					'file',
				].includes(key) &&
				(typeof item !== 'object' ||
					item === null ||
					Array.isArray(item)),
		),
	);
}
