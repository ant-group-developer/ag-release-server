import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ArtistSource } from 'src/modules/artist/enum/artist.enum';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { Release } from '../entities/release.entity';

export const REPORT_IMPORT_FALLBACK_LABEL_ID = 'CHANGE_ME_';

export interface ReleaseReportImportInput {
	upc: string;
	labelName?: string;
	labelId?: string;
	title: string;
	artistName: string;
	tracks: {
		title: string;
		isrc: string;
	}[];
}

@Injectable()
export class ReleaseReportImportService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly dataSource: DataSource,
	) {}

	async importRelease(input: ReleaseReportImportInput): Promise<Release> {
		const existingRelease = await this.releaseRepo.findOne({
			where: { upc: input.upc },
		});
		if (existingRelease) return existingRelease;

		return this.dataSource.transaction(async (manager) => {
			const releaseInTransaction = await manager.findOne(Release, {
				where: { upc: input.upc },
			});
			if (releaseInTransaction) return releaseInTransaction;

			const label = await this.resolveLabel(manager, input);
			const artist = await this.findOrCreateArtist(
				manager,
				input.artistName,
			);

			const release = await manager.save(
				Release,
				manager.create(Release, {
					upc: input.upc,
					title: input.title,
					labelId: label.id,
					tenantId: label.tenantId,
				}),
			);

			const releaseArtist = await manager.save(
				ReleaseArtist,
				manager.create(ReleaseArtist, {
					releaseId: release.id,
					artistId: artist.id,
					addArtistToTracks: true,
				}),
			);

			const tracks = await manager.save(
				Track,
				input.tracks.map((track, index) =>
					manager.create(Track, {
						releaseId: release.id,
						title: track.title,
						isrc: track.isrc,
						order: index + 1,
						copyArtistsFromRelease: true,
					}),
				),
			);

			await manager.save(
				TrackArtist,
				tracks.map((track) =>
					manager.create(TrackArtist, {
						trackId: track.id,
						artistId: artist.id,
						releaseArtistId: releaseArtist.id,
						isFromReleaseAction: true,
					}),
				),
			);

			return release;
		});
	}

	private async resolveLabel(
		manager: EntityManager,
		input: ReleaseReportImportInput,
	): Promise<Label> {
		let label: Label | null = null;

		if (input.labelId) {
			label = await manager.findOne(Label, {
				where: { id: input.labelId },
			});
		}

		if (!label && input.labelName) {
			label = await manager.findOne(Label, {
				where: { name: ILike(input.labelName.trim()) },
				order: { createdAt: 'ASC' },
			});
		}

		if (!label) {
			label = await manager.findOne(Label, {
				where: { id: REPORT_IMPORT_FALLBACK_LABEL_ID },
			});
		}

		if (!label) {
			throw new Error(
				`Report import fallback label "${REPORT_IMPORT_FALLBACK_LABEL_ID}" was not found`,
			);
		}

		return label;
	}

	private async findOrCreateArtist(
		manager: EntityManager,
		artistName: string,
	): Promise<Artist> {
		const name = artistName.trim();
		const existingArtist = await manager.findOne(Artist, {
			where: { name: ILike(name) },
			order: { createdAt: 'ASC' },
		});
		if (existingArtist) return existingArtist;

		return manager.save(
			Artist,
			manager.create(Artist, {
				name,
				code: nanoid(10),
				artistSource: ArtistSource.ANT_MUSIC,
			}),
		);
	}
}
