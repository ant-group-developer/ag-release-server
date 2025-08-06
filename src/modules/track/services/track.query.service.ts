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
			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak')

			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtists.artist', 'artist')

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

	async getDetail(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak')

			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtists.artist', 'artist')

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

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailMetadata(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoinAndSelect('track.primaryGenre', 'primaryGenre')
			.leftJoinAndSelect('track.subGenre', 'subGenre')

			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtists.artist', 'artist')

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
			)

			.leftJoinAndSelect('track.trackLocalizes', 'trackLocalizes')

			.leftJoinAndSelect('track.trackType', 'trackType')
			.leftJoinAndSelect('track.trackOriginType', 'trackOriginType');

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailAudioFile(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak');

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
