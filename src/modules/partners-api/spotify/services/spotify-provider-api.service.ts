import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SpotifyProviderTokenService } from './spotify-provider-token.service';

export interface SonarProductStatus {
	id: string;
	key: {
		feedGid: string;
		deliveryName: string;
		productId: string;
	};
	status: string;
	createdAt: string;
	updatedAt: string;
	tags: Record<string, unknown>;
	licensorUuid: string;
	licensorName: string;
	feedName: string;
	albumMetadata: {
		artistName: string[];
		albumName: string;
		coverArt: {
			smallCoverArt?: { height: number; width: number; sha1digest: string };
			mediumCoverArt?: { height: number; width: number; sha1digest: string };
			largeCoverArt?: { height: number; width: number; sha1digest: string };
		};
		earliestStartDate?: { startDate: string; releaseType: string };
	};
	uri: string;
	isProviderTest: boolean;
	warningStatus: string;
	warningCount: number;
}

export interface SonarDeliveryDetail {
	productDetail: {
		summary: SonarProductStatus;
		validationStatus: {
			status: string;
			happened: string;
			errors: string[];
			rawErrors: unknown[];
			warnings: unknown[];
		};
		assetTranscodingStatuses: unknown[];
	};
}

export interface AtlasCatalog {
	effectiveData: {
		name: string;
		artists: Array<{
			name: string;
			uri: string;
			role: string;
			avatarUri: string;
			isVerified: boolean;
			url: string;
			isOptedInToAPP: boolean;
		}>;
		uri: string;
		url: string;
		type: string;
		coverArtImage: string;
		tracks: Array<{
			name: string;
			duration: number;
			discNumber: number;
			trackNumber: number;
			isrc: string;
			explicitLyrics: boolean;
			uri: string;
			mediaType: string;
		}>;
		labelName: string;
		licensorName: string;
		feedName: string;
		primaryReleaseId: string;
		upc: string;
		originalReleaseDate: string;
		pLine: string;
		cLine: string;
		feedGid: string;
		licensorId: string;
	};
	availability: Record<string, {
		deliveredStart: string;
		deliveredEnd: string;
		effectiveStart: string;
		effectiveEnd: string;
		status: string;
		patches: unknown[];
	}>;
	deliveries: Array<{
		deliveryId: string;
		action: string;
		deliveredAt: string;
		feedName: string;
		productId: string;
		source: string;
		feedGid: string;
		deliveryStatus: string;
		deliveryErrors: unknown[];
		deliveryErrorsAndTypes: Array<{ type: string; message: string }>;
		assetTranscodingStatuses: Array<{ assetType: string; status: string }>;
	}>;
}

@Injectable()
export class SpotifyProviderApiService {
	private readonly logger = new Logger(SpotifyProviderApiService.name);

	private get sonarBaseUrl(): string {
		return process.env.SPOTIFY_SONAR_BASE_URL ?? 'https://sonar-view.spotify.com';
	}

	private get atlasBaseUrl(): string {
		return process.env.SPOTIFY_ATLAS_BASE_URL ?? 'https://atlas-view.spotify.com';
	}

	constructor(
		private readonly httpService: HttpService,
		private readonly tokenService: SpotifyProviderTokenService,
	) {}

	async getDeliveries(upc: string): Promise<SonarProductStatus[]> {
		const token = await this.tokenService.getToken();
		const now = new Date();
		const oneYearAgo = new Date(now);
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

		const params = new URLSearchParams({
			search: upc,
			limit: '10',
			createdAtMin: oneYearAgo.toISOString(),
			createdAtMax: now.toISOString(),
		});

		const { data } = await firstValueFrom(
			this.httpService.get(`${this.sonarBaseUrl}/v2/products?${params.toString()}`, {
				headers: { Authorization: `Bearer ${token}` },
			}),
		);

		return (data?.productStatuses ?? []) as SonarProductStatus[];
	}

	async getDeliveryDetail(
		productId: string,
		deliveryName: string,
		feedGid: string,
	): Promise<SonarDeliveryDetail | null> {
		const token = await this.tokenService.getToken();
		const params = new URLSearchParams({ productId, deliveryName, feedGid });

		try {
			const { data } = await firstValueFrom(
				this.httpService.get(`${this.sonarBaseUrl}/v2/product?${params.toString()}`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
			);

			const product = data?.products?.[0];
			return product ?? null;
		} catch (err) {
			this.logger.warn(`Failed to get delivery detail for ${productId}/${deliveryName}: ${(err as Error).message}`);
			return null;
		}
	}

	async getCatalog(albumUri: string): Promise<AtlasCatalog | null> {
		const token = await this.tokenService.getToken();
		const params = new URLSearchParams({
			'deliveriesPagination.offset': '0',
			'deliveriesPagination.limit': '10',
		});

		try {
			const { data } = await firstValueFrom(
				this.httpService.get(
					`${this.atlasBaseUrl}/v2/album/${encodeURIComponent(albumUri)}?${params.toString()}`,
					{ headers: { Authorization: `Bearer ${token}` } },
				),
			);
			return data as AtlasCatalog;
		} catch (err) {
			this.logger.warn(`Failed to get catalog for ${albumUri}: ${(err as Error).message}`);
			return null;
		}
	}
}
