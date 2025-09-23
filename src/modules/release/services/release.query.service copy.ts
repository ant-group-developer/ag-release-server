// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import {
// 	Brackets,
// 	ILike,
// 	In,
// 	Not,
// 	Repository,
// 	SelectQueryBuilder,
// } from 'typeorm';
// import { QueryGetListReleaseDto } from '../dto/release.dto';
// import { Release } from '../entities/release.entity';
// import {
// 	VirtualColumnRelease,
// 	VirtualColumnReleaseArr,
// } from '../enum/release.enum';

// interface IDataFromDb {
// 	entities: Release[];
// 	raw: {
// 		release_id: string;
// 		tracks_count: string;
// 		total_duration: string;
// 	}[];
// }

// @Injectable()
// export class ReleaseQueryService {
// 	private mainAlias = 'release';

// 	constructor(
// 		@InjectRepository(Release)
// 		private readonly releaseRepo: Repository<Release>,
// 	) {}

// 	public getMainAlias() {
// 		return this.mainAlias;
// 	}

// 	// public methods
// 	async findOne(id: string): Promise<Release> {
// 		return this.findReleaseById(id, [
// 			'releaseLanguage',
// 			'releaseTerritory',
// 		]);
// 	}

// 	async getManyAndCount(query: QueryGetListReleaseDto) {
// 		const qb = this.releaseRepo.createQueryBuilder(this.mainAlias);
// 		this.filterByQuery(qb, query);
// 		this.leftJoin(qb);
// 		this.select(qb, query);

// 		const [dataFromDb, totalItems] = await this.getRawAndEntities(qb);
// 		return {
// 			totalItems,
// 			releases: this.assigneeVirtualColumn(dataFromDb),
// 		};
// 	}

// 	async getListSimple(query: QueryGetListReleaseDto): Promise<any> {
// 		const { idInclude, page, pageSize, keyword } = query;

// 		const releaseInclude = await this.getIncludedReleases(idInclude);
// 		const [items, totalItems] = await this.getReleasesWithPagination(
// 			keyword,
// 			idInclude,
// 			page,
// 			pageSize,
// 		);

// 		return { items: [...releaseInclude, ...items], totalItems };
// 	}

// 	// private methods
// 	private filterByQuery(
// 		qb: SelectQueryBuilder<Release>,
// 		query: QueryGetListReleaseDto,
// 	) {
// 		const {
// 			keyword,
// 			startCreatedAt,
// 			endCreatedAt,
// 			startUpdatedAt,
// 			endUpdatedAt,
// 			startDateRelease,
// 			endDateRelease,
// 			albumFormatId,
// 			status,
// 			primaryGenreId,
// 			subGenreId,
// 			labelId,
// 			artistId,
// 			isVariousArtist,
// 			tenantIds,
// 			fieldOrder,
// 			orderBy,
// 			skip,
// 			pageSize,
// 		} = query;

// 		if (keyword) this.applyKeywordFilter(qb, keyword);
// 		if (startCreatedAt && endCreatedAt)
// 			this.applyDateFilter(qb, 'createdAt', startCreatedAt, endCreatedAt);
// 		if (startUpdatedAt && endUpdatedAt)
// 			this.applyDateFilter(qb, 'updatedAt', startUpdatedAt, endUpdatedAt);
// 		if (startDateRelease && endDateRelease)
// 			this.applyDateFilter(
// 				qb,
// 				'releaseDate',
// 				startDateRelease,
// 				endDateRelease,
// 			);
// 		if (albumFormatId?.length)
// 			qb.andWhere('release.albumFormatId IN (:...albumFormatId)', {
// 				albumFormatId,
// 			});
// 		if (primaryGenreId?.length)
// 			qb.andWhere('release.primaryGenreId IN (:...primaryGenreId)', {
// 				primaryGenreId,
// 			});
// 		if (subGenreId?.length)
// 			qb.andWhere('release.subGenreId IN (:...subGenreId)', {
// 				subGenreId,
// 			});
// 		if (labelId?.length)
// 			qb.andWhere('release.labelId IN (:...labelId)', { labelId });
// 		if (artistId?.length)
// 			qb.andWhere('releaseArtist.artistId IN (:...artistId)', {
// 				artistId,
// 			});
// 		if (status?.length)
// 			qb.andWhere('release.status IN (:...status)', { status });
// 		if (isVariousArtist !== undefined)
// 			qb.andWhere('release.isVariousArtist = :isVariousArtist', {
// 				isVariousArtist,
// 			});
// 		if (tenantIds?.length)
// 			qb.andWhere('release.tenantId IN (:...tenantIds)', { tenantIds });

// 		qb.skip(skip).take(pageSize);
// 		this.applySorting(qb, fieldOrder, orderBy);

// 		return qb;
// 	}

// 	private applyKeywordFilter(
// 		qb: SelectQueryBuilder<Release>,
// 		keyword: string,
// 	) {
// 		qb.andWhere(
// 			new Brackets((qb) => {
// 				qb.where('release.title ILIKE :keyword')
// 					.orWhere('albumFormat.name ILIKE :keyword')
// 					.orWhere('artist.name ILIKE :keyword')
// 					.orWhere('label.name ILIKE :keyword');
// 			}),
// 			{ keyword: `%${keyword}%` },
// 		);
// 	}

// 	private applyDateFilter(
// 		qb: SelectQueryBuilder<Release>,
// 		column: string,
// 		startDate: string,
// 		endDate: string,
// 	) {
// 		qb.andWhere(`${column} BETWEEN :startDate AND :endDate`, {
// 			startDate,
// 			endDate,
// 		});
// 	}

// 	private applySorting(
// 		qb: SelectQueryBuilder<Release>,
// 		fieldOrder: string,
// 		orderBy: 'ASC' | 'DESC',
// 	) {
// 		if (VirtualColumnReleaseArr.includes(fieldOrder)) {
// 			qb.orderBy(`${fieldOrder}`, orderBy);
// 		} else {
// 			qb.orderBy(`release.${fieldOrder}`, orderBy);
// 		}
// 	}

// 	private leftJoin(qb: SelectQueryBuilder<Release>) {
// 		qb.leftJoin('release.albumFormat', 'albumFormat')
// 			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')
// 			.leftJoin('release.releaseArtists', 'releaseArtist')
// 			.leftJoin('releaseArtist.artist', 'artist')
// 			.leftJoin('releaseArtist.artistRole', 'artistRole')
// 			.leftJoin('release.label', 'label');
// 	}

// 	private select(
// 		qb: SelectQueryBuilder<Release>,
// 		query: QueryGetListReleaseDto,
// 	) {
// 		const { tenantIds } = query;
// 		qb.addSelect([
// 			'albumFormat.id',
// 			'albumFormat.name',
// 			'albumFormat.code',
// 			'releaseCoverArt.id',
// 			'releaseCoverArt.fileId',
// 			'releaseCoverArt.width',
// 			'releaseCoverArt.height',
// 			'releaseArtist.id',
// 			'releaseArtist.artistRoleId',
// 			'releaseArtist.artistId',
// 			'releaseArtist.addArtistToTracks',
// 			'artist.id',
// 			'artist.name',
// 			'artist.code',
// 			'artist.picture',
// 			'artist.biography',
// 			'label.id',
// 			'label.name',
// 			'label.picture',
// 			'label.description',
// 		]);
// 		qb.addSelect(
// 			(subQuery) => this.getTracksCountSubQuery(subQuery, tenantIds),
// 			VirtualColumnRelease.TRACKS_COUNT,
// 		);
// 		qb.addSelect(
// 			(subQuery) => this.getTotalDurationSubQuery(subQuery, tenantIds),
// 			VirtualColumnRelease.TOTAL_DURATION,
// 		);
// 	}

// 	private getTracksCountSubQuery(
// 		subQuery: SelectQueryBuilder<Release>,
// 		tenantIds: string[],
// 	) {
// 		subQuery
// 			.select('COUNT(DISTINCT(track_sub1.id))')
// 			.from('tracks', 'track_sub1')
// 			.where('track_sub1.release_id = release.id');

// 		if (tenantIds?.length) {
// 			subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
// 				tenantIds,
// 			});
// 		}

// 		return subQuery;
// 	}

// 	private getTotalDurationSubQuery(
// 		subQuery: SelectQueryBuilder<Release>,
// 		tenantIds: string[],
// 	) {
// 		subQuery
// 			.select('SUM(DISTINCT(audio_files_sub2.duration))')
// 			.from('tracks', 'track_sub2')
// 			.leftJoin(
// 				'audio_files',
// 				'audio_files_sub2',
// 				'audio_files_sub2.track_id = track_sub2.id',
// 			)
// 			.where('track_sub2.release_id = release.id');

// 		if (tenantIds?.length) {
// 			subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
// 				tenantIds,
// 			});
// 		}

// 		return subQuery;
// 	}

// 	private async getRawAndEntities(qb: SelectQueryBuilder<Release>) {
// 		return await Promise.all([qb.getRawAndEntities(), qb.getCount()]);
// 	}

// 	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
// 		return dataFromDb.entities.map((entity) => {
// 			const dataRawOfRelease = dataFromDb.raw.find(
// 				(item) => item.release_id === entity.id,
// 			);
// 			entity.tracksCount = Number(dataRawOfRelease?.tracks_count);
// 			entity.totalDuration = Number(dataRawOfRelease?.total_duration);
// 			return entity;
// 		});
// 	}

// 	private async getIncludedReleases(idInclude?: string[]) {
// 		if (idInclude?.length) {
// 			return await this.releaseRepo.find({
// 				select: { id: true, title: true },
// 				where: { id: In(idInclude) },
// 			});
// 		}
// 		return [];
// 	}

// 	private async getReleasesWithPagination(
// 		keyword?: string,
// 		idInclude?: string[],
// 		page?: number,
// 		pageSize?: number,
// 	) {
// 		return await this.releaseRepo.findAndCount({
// 			select: { id: true, title: true },
// 			where: {
// 				...(keyword ? { title: ILike(`%${keyword}%`) } : {}),
// 				...(idInclude?.length ? { id: Not(In(idInclude)) } : {}),
// 			},
// 			order: { title: 'ASC' },
// 			skip: (page - 1) * pageSize,
// 			take: pageSize,
// 		});
// 	}

// 	private findReleaseById(id: string, relations: string[]) {
// 		return this.releaseRepo.findOne({
// 			where: { id },
// 			relations,
// 		});
// 	}
// }
