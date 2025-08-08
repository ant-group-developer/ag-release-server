import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackMessageError } from '../constants/track.constant';
import { QueryGetListTrackDto } from '../dto/track.dto';
import { Track } from '../entities/track.entity';

@Injectable()
export class TrackQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {
		this.mainAlias = 'track';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	private createQueryGetList(query: QueryGetListTrackDto) {
		const {
			keyword,

			releaseId,

			artistId,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.trackRepo.createQueryBuilder('track');

		queryBuilder
			.leftJoin('track.release', 'release')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak')

			.leftJoinAndSelect('track.trackArtists', 'trackArtist')
			.leftJoinAndSelect('trackArtist.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtist.artist', 'artist')

			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoinAndSelect(
				'trackLanguage.recordingCountry',
				'recordingCountry',
			)
			.leftJoinAndSelect('trackLanguage.audioLanguage', 'audioLanguage')

			.leftJoinAndSelect('track.primaryGenre', 'primaryGenre')
			.leftJoinAndSelect('track.subGenre', 'subGenre')

			.leftJoinAndSelect('track.trackType', 'trackType')
			.leftJoinAndSelect('track.trackOriginType', 'trackOriginType');

		// select
		queryBuilder
			.addSelect(['release.id', 'release.title'])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.type',
			]);

		if (keyword) {
			queryBuilder.andWhere('track.title ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (releaseId) {
			queryBuilder.andWhere('track.releaseId = :releaseId', {
				releaseId: releaseId,
			});
		}

		if (artistId) {
			queryBuilder.andWhere('track.releaseId = :releaseId', {
				releaseId: releaseId,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`track.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`track.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`track.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListTrackDto) {
		const queryGetList = this.createQueryGetList(query);

		return await queryGetList.getManyAndCount();
	}

	async findOne(id: string): Promise<Track> {
		const track = await this.trackRepo.findOne({
			where: { id },
		});

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.release', 'release')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')
			.leftJoin('release.label', 'label')

			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak')

			.leftJoinAndSelect('track.trackArtists', 'trackArtist')
			.leftJoinAndSelect('trackArtist.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtist.artist', 'artist')

			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoinAndSelect(
				'trackLanguage.recordingCountry',
				'recordingCountry',
			)
			.leftJoinAndSelect('trackLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguage',
				'metadataLanguage',
			);

		// select
		query
			.addSelect(['release.id', 'release.title'])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.type',
			])
			.addSelect([
				'label.id',
				'label.name',
				'label.picture',
				'label.description',
			]);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailMetadataOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.primaryGenre', 'primaryGenre')
			.leftJoin('track.subGenre', 'subGenre')

			.leftJoin('track.trackArtists', 'trackArtist')
			.leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist')

			.leftJoin('track.trackLanguage', 'trackLanguage')
			.leftJoin(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('trackLanguage.recordingCountry', 'recordingCountry')
			.leftJoin('trackLanguage.audioLanguage', 'audioLanguage')
			.leftJoin('trackLanguage.metadataLanguage', 'metadataLanguage')

			.leftJoin('track.trackLocalizes', 'trackLocalize')

			.leftJoin('track.trackType', 'trackType')
			.leftJoin('track.trackOriginType', 'trackOriginType');

		// select
		query.select([
			'track.title',
			'track.version',
			'track.isrc',
			'track.isSensitiveContent',
			'track.pLineYear',
			'track.pLineOwner',
		]);

		query
			.addSelect(['trackArtist.id'])
			.addSelect(['artistRole.name'])
			.addSelect(['artist.name', 'artist.picture']);

		query.addSelect([
			'primaryGenre.name',
			'primaryGenre.value',
			'primaryGenre.picture',
		]);

		query.addSelect([
			'subGenre.name',
			'subGenre.value',
			'subGenre.picture',
		]);

		query
			.addSelect(['trackLanguage.id'])
			.addSelect(['metadataLanguageCountry.name'])
			.addSelect(['recordingCountry.name'])
			.addSelect(['audioLanguage.name'])
			.addSelect(['metadataLanguage.name']);

		query.addSelect(['trackType.name']);
		query.addSelect(['trackOriginType.name']);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailAudioFileOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.audioFile', 'audioFile')
			.leftJoin('audioFile.file', 'file')
			.leftJoin('audioFile.peak', 'peak');

		query.select(['track.title']);

		query.addSelect([
			'audioFile.bitrate',
			'audioFile.bitDepth',
			'audioFile.sampleRate',
			'audioFile.fileId',
			'audioFile.peakId',
		]);

		query.addSelect(['file.id', 'peak.id']);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getTracksOfRelease({ releaseId }: { releaseId: string }) {
		return this.trackRepo.find({ where: { releaseId } });
	}
}
