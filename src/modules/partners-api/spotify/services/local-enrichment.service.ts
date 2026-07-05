import { Injectable, Logger } from '@nestjs/common';
import {
	ReleaseEnrichment,
	ReleaseEnrichmentStatus,
} from 'src/modules/release/entities/release-enrichment.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { buildEquivalentUpcs, normalizeUpc } from 'src/utils/upc.util';
import { DataSource, ILike, In } from 'typeorm';
import { EnrichedMetadata } from './metadata-enrichment.service';

@Injectable()
export class LocalEnrichmentService {
	private readonly logger = new Logger(LocalEnrichmentService.name);

	constructor(private readonly dataSource: DataSource) {}

	/**
	 * Check if a track with this ISRC already exists in the local DB.
	 * If found, construct EnrichedMetadata from the release + tracks data.
	 */
	async findLocalByIsrc(isrc: string): Promise<EnrichedMetadata | null> {
		try {
			const trackRepo = this.dataSource.getRepository(Track);
			const track = await trackRepo.findOne({
				where: { isrc: ILike(isrc) },
				relations: [
					'release',
					'release.releaseArtists',
					'release.releaseArtists.artist',
					'release.label',
					'release.tracks',
				],
			});

			if (!track?.release) return null;

			const release = track.release;

			// Only use local data if it has a real UPC/EAN, not a report/internal code.
			if (!this.isValidStandardUpc(release.upc)) {
				return null;
			}
			if (!(await this.hasSuccessfulEnrichment(release.id))) {
				return null;
			}

			return this.buildLocalEnrichedMetadata(release, isrc);
		} catch (err) {
			this.logger.warn(
				`[Local Cache] Failed to query local DB for ISRC ${isrc}: ${err.message}`,
			);
			return null;
		}
	}

	/**
	 * Check if a release with this UPC already exists in the local DB.
	 * If found, construct EnrichedMetadata from the release data.
	 */
	async findLocalByUpc(upc: string): Promise<EnrichedMetadata | null> {
		try {
			const releaseRepo = this.dataSource.getRepository(Release);
			const release = await releaseRepo.findOne({
				where: { upc: In(buildEquivalentUpcs(upc)) },
				relations: [
					'releaseArtists',
					'releaseArtists.artist',
					'label',
					'tracks',
				],
			});

			if (!release) return null;

			// Only use local data if UPC is a real UPC/EAN and title is present.
			if (
				!this.isValidStandardUpc(release.upc) ||
				!release.title?.trim()
			) {
				return null;
			}
			if (!(await this.hasSuccessfulEnrichment(release.id))) {
				return null;
			}

			const primaryIsrc =
				(release.tracks || [])
					.filter(
						(t) =>
							t.isrc &&
							!t.isrc.trim().toUpperCase().startsWith('UPC-'),
					)
					.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.isrc ||
				'';

			return this.buildLocalEnrichedMetadata(release, primaryIsrc);
		} catch (err) {
			this.logger.warn(
				`[Local Cache] Failed to query local DB for UPC ${upc}: ${err.message}`,
			);
			return null;
		}
	}

	/**
	 * Build EnrichedMetadata from a local Release entity.
	 */
	private buildLocalEnrichedMetadata(
		release: Release,
		primaryIsrc: string,
	): EnrichedMetadata {
		const primaryArtist = (release.releaseArtists || []).find(
			(ra) => ra.artist,
		)?.artist;

		const tracks = (release.tracks || [])
			.filter(
				(t) =>
					t.isrc && !t.isrc.trim().toUpperCase().startsWith('UPC-'),
			)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map((t) => ({
				isrc: t.isrc!,
				title: t.title || '',
				trackNumber: t.order,
			}));

		return {
			source: 'local',
			isrc: primaryIsrc,
			trackTitle: tracks[0]?.title || '',
			artistName: primaryArtist?.name || '',
			upc: normalizeUpc(release.upc),
			albumTitle: release.title || '',
			releaseDate: release.releaseDate
				? new Date(release.releaseDate).toISOString().slice(0, 10)
				: undefined,
			totalTracks: tracks.length || undefined,
			labelName: release.label?.name,
			tracks,
		};
	}

	private isValidStandardUpc(upc?: string | null): boolean {
		const normalized = normalizeUpc(upc);
		return /^\d{10,14}$/.test(normalized);
	}

	private async hasSuccessfulEnrichment(releaseId: string): Promise<boolean> {
		const enrichmentRepo = this.dataSource.getRepository(ReleaseEnrichment);
		return enrichmentRepo.exists({
			where: {
				releaseId,
				status: ReleaseEnrichmentStatus.SUCCESS,
			},
		});
	}
}
