import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { Release } from '../release/entities/release.entity';
import { Track } from '../track/entities/track.entity';
import { FilterDto } from './dto/orm.dto';
import { ReleaseFields } from './filed-mappings/orm.release';

@Injectable()
export class OrmService {
	private readonly releaseAlias = 'release';
	private readonly trackAlias = 'track';

	private readonly releaseFields = ReleaseFields;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {}

	createReleaseQb() {
		return this.releaseRepo.createQueryBuilder(this.releaseAlias);
	}

	createTrackQb() {
		return this.trackRepo.createQueryBuilder(this.trackAlias);
	}

	// leftJoin_EntityA_With_EntityB
	leftJoinReleaseWithTrack(qb: SelectQueryBuilder<any>) {
		qb.leftJoin(this.releaseFields.TRACKS, this.trackAlias);
	}

	// applyFilter
	applyFilter({
		filter,
		qb,
	}: {
		filter: FilterDto;
		qb: SelectQueryBuilder<any>;
	}) {
		const { keyword, releaseStartCreatedAt, releaseEndCreatedAt } = filter;
		this.andWhereReleaseKeyword({ qb, keyword });

		this.andWhereReleaseCreatedAt({
			qb,
			startCreatedAt: releaseStartCreatedAt,
			endCreatedAt: releaseEndCreatedAt,
		});
	}

	// andWhere_Entity_Field
	andWhereReleaseKeyword({
		keyword,
		qb,
	}: {
		keyword?: string[];
		qb: SelectQueryBuilder<any>;
	}) {
		if (keyword?.length) {
			const params: Record<string, any> = {};

			qb.andWhere(
				new Brackets((qb1) => {
					keyword.forEach((kw, i) => {
						const param = `keyword_${i}`;
						const condition = new Brackets((subQb) => {
							subQb
								.where(`release.title ILIKE :${param}`)
								.orWhere(`albumFormat.name ILIKE :${param}`)
								.orWhere(`artist.name ILIKE :${param}`)
								.orWhere(`label.name ILIKE :${param}`);
						});

						if (i === 0) qb1.where(condition);
						else qb1.orWhere(condition);

						params[param] = `%${kw}%`;
					});
				}),
				params,
			);
		}
	}

	andWhereReleaseInIds({
		ids,
		qb,
	}: {
		ids?: string[];
		qb: SelectQueryBuilder<any>;
	}) {
		if (ids?.length) {
			qb.andWhere(`${this.releaseFields.ID} IN (:...ids)`, {
				ids,
			});
		}
	}

	andWhereReleaseCreatedAt({
		qb,
		startCreatedAt,
		endCreatedAt,
	}: {
		qb: SelectQueryBuilder<any>;
		startCreatedAt?: Date;
		endCreatedAt?: Date;
	}) {
		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`${this.releaseFields.CREATED_AT} BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}
	}

	// select_Entity_Field
	select({ qb, fields }: { qb: SelectQueryBuilder<any>; fields: string[] }) {
		qb.select(fields);
	}

	// addSelect_Entity_Field
	addSelect({
		qb,
		fields,
	}: {
		qb: SelectQueryBuilder<any>;
		fields: string[];
	}) {
		qb.addSelect(fields);
	}
}
