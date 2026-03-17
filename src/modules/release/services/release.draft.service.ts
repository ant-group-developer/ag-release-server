import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldErrorDetails } from 'src/common/dtos/common.response.dto';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseArtistService } from 'src/modules/release-artist/services/release-artist.service';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ReleaseCoverArtSize } from 'src/modules/release-cover-art/enum/release-cover-art.enum';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLanguageDraftService } from 'src/modules/release-language/services/release-language.draft.service';
import { UpdateReleaseTerritoryDto } from 'src/modules/release-territory/dto/release-territory.dto';
import { ReleaseTerritory } from 'src/modules/release-territory/entities/release-territory.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';
import { ReleaseTerritoryService } from 'src/modules/release-territory/services/release-territory.service';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackContributor } from 'src/modules/track-contributor/entities/track-contributor.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackSensitive } from 'src/modules/track-sensitive/entities/track-sensitive.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import { newTransaction } from 'src/utils/utils.transaction';
import { DataSource, Repository } from 'typeorm';
import { LookupMaps, ReleaseRawSftp } from '../dto/release-sftp.dto';
import {
	CreateReleaseDraftDto,
	UpdateReleaseDraftDto,
} from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus, ReleaseTimeMode } from '../enum/release.enum';
import { IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseDraftService {
	private readonly logger = new Logger(ReleaseDraftService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly releaseCoverArtService: ReleaseCoverArtService,
		private readonly releaseLanguageDraftService: ReleaseLanguageDraftService,
		private readonly releaseArtistService: ReleaseArtistService,
		private readonly releaseTerritoryService: ReleaseTerritoryService,

		private readonly trackDraftService: TrackDraftService,
		private readonly dataSource: DataSource,
	) {}

	// create
	async create(
		data: CreateReleaseDraftDto,
		tenantId: string,
		userId: string,
	): Promise<Release> {
		const {
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		} = data;

		await this.releaseValidateService.validate({
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
		});

		const release = this.releaseRepo.create({
			...data,
			tenantId,
			creatorId: userId,
			modifierId: userId,
		});
		const releaseDb = await this.releaseRepo.save(release);

		// coverArt
		await this.createSubEntities(releaseDb.id);

		return releaseDb;
	}

	private async createSubEntities(releaseId: string) {
		await this.releaseLanguageDraftService.create({
			releaseId,
		});

		await this.releaseTerritoryService.create({
			releaseId,
		});
	}

	// update
	async update(
		id: string,
		data: UpdateReleaseDraftDto,
		userId: string,
	): Promise<IReleaseDetail> {
		const {
			releaseCoverArt,
			releaseLanguage,
			releaseTerritory,
			...restOfData
		} = data;

		const release = await this.releaseQueryService.findOne(id);

		// if (release.status !== ReleaseStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Error release.status',
		// 	});
		// }

		await this.releaseValidateService.handleValidateDataUpdate({
			release,
			dataUpdate: data,
		});

		// subEntities
		await this.updateSubEntities({
			release,
			releaseLanguage,
			releaseCoverArt,
			releaseTerritory,
		});

		await this.releaseRepo.update(id, {
			...restOfData,
			modifierId: userId,
		});
		const releaseDb = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = releaseDb;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	private async updateSubEntities({
		release,
		releaseLanguage,
		releaseCoverArt,
		releaseTerritory,
	}: {
		release: Release;
		releaseLanguage?: UpdateReleaseLanguageDraftDto;
		releaseCoverArt?: CreateReleaseCoverArtDto | null;
		releaseTerritory?: UpdateReleaseTerritoryDto;
	}) {
		const releaseId = release.id;

		await this.releaseLanguageDraftService.handleUpdateReleaseLanguage({
			release,
			releaseLanguage,
		});

		await this.releaseTerritoryService.handleUpdateReleaseTerritory({
			release,
			releaseTerritory,
		});

		await this.releaseCoverArtService.handleUpdateReleaseCoverArt({
			releaseId,
			releaseCoverArt,
		});
	}

	// delete
	async deleteDb(id: string) {
		await this.releaseRepo.delete(id);
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteRelatedRecords({ releaseId: id });
		await this.deleteDb(id);
	}

	private async deleteRelatedRecords({ releaseId }: { releaseId: string }) {
		await Promise.all([
			this.releaseLanguageDraftService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseArtistService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseCoverArtService.deleteRecordOfRelease({
				releaseId,
			}),

			this.trackDraftService.deleteRecordOfRelease({
				releaseId,
			}),

			this.releaseTerritoryService.deleteRecordOfRelease({
				releaseId,
			}),
		]);
	}

	// other
	// coverArt
	async autoFillCoverArts(id: string) {
		return await this.releaseCoverArtService.autoFillCoverArts({
			releaseId: id,
		});
	}

	async getErrorsSchemaReleaseById(id: string) {
		const release = await this.releaseQueryService.findOneWithRelation(id);
		return this.releaseValidateService.getErrorsSchemaRelease(release);
	}

	async getErrorsSchemaReleasesFromSftp(releases: any[]) {
		console.log(JSON.stringify(releases));
		const maps = await this.buildLookupMaps();

		const success: string[] = [];
		const failed: { id: string; errors: string }[] = [];

		for (const r of releases) {
			const { errors: existErrors, fakeRelease } =
				this.mapAndValidateExistence(r, maps);

			if (existErrors.length > 0 || !fakeRelease) {
				failed.push({
					id: r.id,
					errors:
						existErrors.join(', ') ||
						'Dữ liệu release không hợp lệ',
				});
				continue;
			}

			const schemaErrors =
				this.releaseValidateService.getErrorsSchemaRelease(
					fakeRelease,
					true,
				);

			if (schemaErrors.length === 0) {
				success.push(r.id);
			} else {
				failed.push({
					id: r.id,
					errors: schemaErrors
						.map((e: FieldErrorDetails) => e.field ?? e.field)
						.join(', '),
				});
			}
		}

		return { success, failed };
	}

	mapAndValidateExistence(
		r: ReleaseRawSftp,
		maps: LookupMaps,
	): {
		errors: string[];
		fakeRelease: Release | null;
	} {
		const errors: string[] = [];

		const normalize = (value?: string | null) => (value ?? '').trim();

		const getId = (
			map: Map<string, string>,
			value?: string | null,
			field?: string,
			required = false,
		) => {
			const key = normalize(value);

			if (!key) {
				if (required && field) errors.push(`${field} là bắt buộc`);
				return null;
			}

			const id = map.get(key);
			if (!id && field) {
				errors.push(`${field} không tồn tại: "${value}"`);
			}

			return id ?? null;
		};

		const albumFormatId = getId(
			maps.albumFormat,
			r.albumFormat,
			'albumFormat',
			true,
		);
		const primaryGenreId = getId(
			maps.genre,
			r.primaryGenre,
			'primaryGenre',
		);
		const subGenreId = getId(maps.genre, r.subGenre, 'subGenre');
		const labelId = getId(maps.label, r.label, 'label');

		const releaseAudioLanguageId = getId(
			maps.language,
			r.audioLanguage,
			'audioLanguage',
		);
		const releaseMetadataLanguageId = getId(
			maps.language,
			r.metadataLanguage,
			'metadataLanguage',
		);
		const releaseMetadataLanguageCountryId = getId(
			maps.country,
			r.metadataLanguageCountry,
			'metadataLanguageCountry',
		);

		// const releaseTimezoneId = getId(
		// 	maps.timezone,
		// 	r.releaseTimezoneId,
		// 	'releaseTimezoneId',
		// );

		const releaseTimezoneId = 'dc31fdba-95a6-4063-8c4b-a9c7d3d96da8';

		if (!normalize(r.id)) errors.push('id là bắt buộc');
		if (!normalize(r.title)) errors.push('title là bắt buộc');

		const selectedCountries = (r.selectedCountries ?? [])
			.map((countryName) => {
				const countryId = getId(
					maps.country,
					countryName,
					`selectedCountries`,
				);

				if (!countryId) return null;

				const country = new Country();
				country.id = countryId;
				return country;
			})
			.filter(Boolean) as Country[];

		const releaseArtists: ReleaseArtist[] = [];
		const seenArtistIds = new Set<string>();

		(r.artists ?? []).forEach((artistName, index) => {
			const artistId = getId(
				maps.artist,
				artistName,
				`artists[${index}]`,
			);

			if (!artistId) return;
			if (seenArtistIds.has(artistId)) return;

			seenArtistIds.add(artistId);

			const releaseArtist = new ReleaseArtist();
			releaseArtist.releaseId = r.id;
			releaseArtist.artistId = artistId;
			releaseArtist.addArtistToTracks = true;

			const artistEntity = new Artist();
			artistEntity.id = artistId;
			releaseArtist.artist = artistEntity;

			releaseArtists.push(releaseArtist);
		});

		const mappedTracks: Track[] = (r.tracks ?? []).map((trackRaw) => {
			console.log(trackRaw);
			const track = new Track();

			const trackPrimaryGenreId = getId(
				maps.genre,
				trackRaw.primaryGenre,
				`track.primaryGenre`,
			);
			const trackSubGenreId = getId(
				maps.genre,
				trackRaw.subGenre,
				`track.subGenre`,
			);
			const trackTypeId = getId(
				maps.trackType,
				trackRaw.trackType,
				`track.trackType`,
			);
			const trackOriginTypeId = getId(
				maps.trackOriginType,
				trackRaw.trackOriginType,
				`track.trackOriginType`,
			);
			const trackSensitiveId = getId(
				maps.trackSensitive,
				trackRaw.trackSensitive,
				`track.trackSensitive`,
			);
			const priceTierId = getId(
				maps.priceTier,
				trackRaw.priceTier,
				`track.priceTier`,
			);

			// if (!normalize(trackRaw.id)) {
			// 	errors.push(`track.id là bắt buộc`);
			// }
			if (!normalize(trackRaw.title)) {
				errors.push(`track.title là bắt buộc`);
			}

			track.releaseId = r.id;
			track.title = trackRaw.title ?? '';
			track.version = trackRaw.version ?? null;
			track.isrc = trackRaw.isrc ?? null;
			track.iswc = trackRaw.iswc ?? null;
			track.primaryGenreId = trackPrimaryGenreId;
			track.subGenreId = trackSubGenreId;
			track.trackTypeId = trackTypeId;
			track.trackOriginTypeId = trackOriginTypeId;
			track.trackSensitiveId = trackSensitiveId;
			track.priceTierId = priceTierId;
			track.pLineYear = trackRaw.pLineYear ?? null;
			track.pLineOwner = trackRaw.pLineOwner ?? null;
			track.order = trackRaw.order ?? 0;
			track.isByAi = trackRaw.isByAi ?? false;
			track.lyric = trackRaw.lyric ?? 'null';
			track.copyArtistsFromRelease =
				trackRaw.copyArtistsFromRelease ?? false;
			track.copyContributorsFromRelease =
				trackRaw.copyContributorsFromRelease ?? false;

			return track;
		});

		if (errors.length) {
			return {
				errors,
				fakeRelease: null,
			};
		}

		const fakeRelease = new Release();

		Object.assign(fakeRelease, {
			id: r.id,
			upc: r.upc ?? '',
			albumFormatId: albumFormatId ?? '',
			primaryGenreId,
			subGenreId,
			labelId,

			title: r.title ?? '',
			version: r.version ?? '',
			status: r.status ?? ReleaseStatus.DRAFT,

			cLineYear: r.cLineYear ?? null,
			cLineOwner: r.cLineOwner ?? null,
			pLineYear: r.pLineYear ?? null,
			pLineOwner: r.pLineOwner ?? null,

			catalogId: r.catalogId ?? '',
			isVariousArtist: r.isVariousArtist ?? false,
			releaseTimeMode:
				r.releaseTimeMode ?? ReleaseTimeMode.GLOBAL_MIDNIGHT,
			releaseTimezoneId,
			releaseDate: r.releaseDate
				? new Date(r.releaseDate.split('/').reverse().join('-'))
				: null,
			releaseTime: r.releaseTime ?? null,

			// tenantId: r.tenantId ?? null,
			tenantId: 'b4f924e8-d6e7-4b02-8bbe-5ae2b0f97b7a',
			metadataCi: r.metadataCi ?? null,
			metadataSpotify: r.metadataSpotify ?? null,
			releaseArtists,
		});

		// relation: albumFormat
		const albumFormatEntity = new AlbumFormat();
		albumFormatEntity.id = albumFormatId ?? '';
		fakeRelease.albumFormat = albumFormatEntity;

		// relation: releaseCoverArts
		fakeRelease.releaseCoverArts = r.thumbnail
			? [
					Object.assign(new ReleaseCoverArt(), {
						fileId: null,
						releaseId: r.id,
						width: r.thumbnail.width,
						height: r.thumbnail.height,
						type: ReleaseCoverArtSize.ORIGINAL,
					}),
				]
			: [];

		// relation: releaseLanguage
		fakeRelease.releaseLanguage = Object.assign(new ReleaseLanguage(), {
			releaseId: r.id,
			audioLanguageId: releaseAudioLanguageId,
			metadataLanguageId: releaseMetadataLanguageId,
			metadataLanguageCountryId: releaseMetadataLanguageCountryId,
		});

		// relation: releaseTerritory
		fakeRelease.releaseTerritory = Object.assign(new ReleaseTerritory(), {
			releaseId: r.id,
			distributeWorldwide: r.distributeWorldwide ?? true,
			distributionType: r.distributionType ?? null,
			selectedCountries,
		});

		// relation: tracks
		fakeRelease.tracks = mappedTracks;

		return {
			errors: [],
			fakeRelease,
		};
	}

	// sftp
	async importOneRelease(
		payload: ReleaseRawSftp,
		maps?: LookupMaps,
	): Promise<{
		success: boolean;
		releaseId: string;
		release: Release;
	}> {
		const m = maps ?? (await this.buildLookupMaps());

		const { errors, fakeRelease } = this.mapAndValidateExistence(
			payload,
			m,
		);

		if (errors.length) {
			throw new Error(errors.join(' | '));
		}

		if (!fakeRelease) {
			throw new Error('Không map được release');
		}

		const queryRunner = await newTransaction(this.releaseRepo);

		try {
			const { manager } = queryRunner;

			// 1. lưu release chính
			await manager.save(Release, fakeRelease);

			// 2. release language
			if (fakeRelease.releaseLanguage) {
				await manager.save(
					ReleaseLanguage,
					fakeRelease.releaseLanguage,
				);
			}

			// 3. release territory
			if (fakeRelease.releaseTerritory) {
				await manager.save(
					ReleaseTerritory,
					fakeRelease.releaseTerritory,
				);
			}

			// 4. release cover arts
			if (fakeRelease.releaseCoverArts?.length) {
				await manager.save(
					ReleaseCoverArt,
					fakeRelease.releaseCoverArts,
				);

				await this.releaseCoverArtService.autoFillCoverArts({
					releaseId: fakeRelease.id,
					manager,
				});
			}

			if (fakeRelease.releaseArtists) {
				await manager.save(ReleaseArtist, fakeRelease.releaseArtists);
			}

			// 5. tracks
			if (fakeRelease.tracks?.length) {
				for (const track of fakeRelease.tracks) {
					await manager.save(Track, track);

					if ((track as any).trackLanguage) {
						await manager.save(
							TrackLanguage,
							(track as any).trackLanguage,
						);
					}

					if (track.trackArtists?.length) {
						await manager.save(TrackArtist, track.trackArtists);
					}

					if (track.trackContributors?.length) {
						await manager.save(
							TrackContributor,
							track.trackContributors,
						);
					}
				}
			}

			await queryRunner.commitTransaction();

			return {
				success: true,
				releaseId: fakeRelease.id,
				release: fakeRelease as Release,
			};
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}

	async importReleases(payloads: ReleaseRawSftp[]) {
		console.log(JSON.stringify(payloads));

		const maps = await this.buildLookupMaps();

		const results = await Promise.allSettled(
			payloads.map((p) => this.importOneRelease(p, maps)),
		);

		const errors: {
			releaseId: string | null;
			error: string;
			type: 'import' | 'schema';
		}[] = [];

		const ids: (string | null)[] = [];

		for (let i = 0; i < results.length; i++) {
			const item = results[i];
			const payload = payloads[i];

			if (item.status === 'rejected') {
				errors.push({
					releaseId: payload.id ?? null,
					error: item.reason?.message || 'Import release failed',
					type: 'import',
				});
				ids.push(null);
				continue;
			}

			const { releaseId, release } = item.value;
			ids.push(releaseId);

			const schemaErrors =
				this.releaseValidateService.getErrorsSchemaRelease(release);

			if (schemaErrors.length > 0) {
				try {
					await this.handleDelete(releaseId);

					errors.push({
						releaseId,
						error: `Schema validation failed: ${JSON.stringify(schemaErrors)}`,
						type: 'schema',
					});
				} catch (deleteError: any) {
					errors.push({
						releaseId,
						error: `Schema validation failed and delete failed: ${
							deleteError?.message || 'Unknown delete error'
						}`,
						type: 'schema',
					});
				}
			}
		}

		const result = {
			total: payloads.length,
			success:
				results.filter((r) => r.status === 'fulfilled').length -
				errors.filter((e) => e.type === 'schema').length,
			failed: errors.length,
			errors,
			ids,
		};

		console.log(result);
		return result;
	}

	async buildLookupMaps(): Promise<LookupMaps> {
		const albumFormatRepo = this.dataSource.getRepository(AlbumFormat);
		const genreRepo = this.dataSource.getRepository(Genre);
		const labelRepo = this.dataSource.getRepository(Label);
		const trackTypeRepo = this.dataSource.getRepository(TrackType);
		const trackSensitiveRepo =
			this.dataSource.getRepository(TrackSensitive);
		const trackOriginTypeRepo =
			this.dataSource.getRepository(TrackOriginType);
		const priceTierRepo = this.dataSource.getRepository(PriceTier);
		const languageRepo = this.dataSource.getRepository(Language);
		const countryRepo = this.dataSource.getRepository(Country);
		const artistRepo = this.dataSource.getRepository(Artist);

		const [
			albumFormats,
			genres,
			labels,
			trackTypes,
			trackSensitives,
			trackOriginTypes,
			priceTiers,
			languages,
			countries,
			artists,
		] = await Promise.all([
			albumFormatRepo.find(),
			genreRepo.find(),
			labelRepo.find(),
			trackTypeRepo.find(),
			trackSensitiveRepo.find(),
			trackOriginTypeRepo.find(),
			priceTierRepo.find(),
			languageRepo.find(),
			countryRepo.find(),
			artistRepo.find(),
		]);

		return {
			albumFormat: new Map(albumFormats.map((r) => [r.name, r.id])),
			albumFormatEntity: new Map(albumFormats.map((r) => [r.name, r])),
			genre: new Map(genres.map((r) => [r.name, r.id])),
			label: new Map(labels.map((r) => [r.name, r.id])),
			trackType: new Map(trackTypes.map((r) => [r.name, r.id])),
			trackSensitive: new Map(trackSensitives.map((r) => [r.name, r.id])),
			trackOriginType: new Map(
				trackOriginTypes.map((r) => [r.name, r.id]),
			),
			priceTier: new Map(
				priceTiers.flatMap((r) =>
					r.code ? [[r.code, r.id] as const] : [],
				),
			),
			language: new Map(languages.map((r) => [r.name, r.id])),
			country: new Map(countries.map((r) => [r.name, r.id])),

			// chưa có bảng/nguồn thì để tạm
			distributionType: new Map<string, DistributionType>(),

			artist: new Map(artists.map((r) => [r.name, r.id])),
		};
	}
}
