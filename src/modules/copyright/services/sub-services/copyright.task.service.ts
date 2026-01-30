import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { QueryGetListTask } from '../../dtos/copyright.dto';
import { TrackScanStatus } from '../../entities/track-scan-status.entity';
import { ScanStatus } from '../../enums/copyright.enum';
import { ICreateTask } from '../../interface/copyright.interface';

export class CopyrightTaskService {
	constructor(
		@InjectRepository(TrackScanStatus)
		private readonly trackScanStatusRepo: Repository<TrackScanStatus>,
	) {}

	// create
	async create(data: ICreateTask, userId: string): Promise<TrackScanStatus> {
		const task = this.trackScanStatusRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.trackScanStatusRepo.save(task);
	}

	async updateStatus(id: string, status: ScanStatus) {
		await this.trackScanStatusRepo.update(id, { status });
	}

	async addScannedTrackId({
		taskId,
		trackId,
	}: {
		taskId: string;
		trackId: string;
	}) {
		const task = await this.findOne(taskId);

		if (!task.trackScannedIds.includes(trackId)) {
			task.trackScannedIds.push(trackId);
			await this.trackScanStatusRepo.update(taskId, {
				trackScannedIds: task.trackScannedIds,
			});
		}
	}

	// read
	async findOne(id: string) {
		const task = await this.trackScanStatusRepo.findOne({ where: { id } });
		if (!task) {
			throw new ResponseError({ message: 'Task not found' });
		}
		return task;
	}

	async getDetailTask(id: string) {
		const queryGetDetail = this.createQueryGetDetail(id);
		const rawData = await queryGetDetail.getRawOne();

		if (!rawData) {
			throw new ResponseError({ message: 'Task not found' });
		}

		return this.mapTrackScanStatusDetail(rawData);
	}

	async getListTask(query: QueryGetListTask) {
		const { page, pageSize } = query;
		const queryGetList = this.createQueryGetList(query);

		const [items, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	private mapTrackScanStatusDetail(rawData: any) {
		return {
			id: rawData.trackScanStatus_id,
			status: rawData.trackScanStatus_status,
			creatorId: rawData.trackScanStatus_creator_id,
			modifierId: rawData.trackScanStatus_modifier_id,
			filter: rawData.trackScanStatus_filter,
			trackNeedScanIds: rawData.trackScanStatus_track_need_scan_ids,
			trackScannedIds: rawData.trackScanStatus_track_scanned_ids,
			createdAt: rawData.trackScanStatus_created_at,
			updatedAt: rawData.trackScanStatus_updated_at,
			creator: {
				id: rawData.creator_id,
				name: rawData.creator_name,
				avatar: rawData.creator_avatar,
			},
			modifier: {
				id: rawData.modifier_id,
				name: rawData.modifier_name,
				avatar: rawData.modifier_avatar,
			},
			trackNeedScan: rawData.trackNeedScan || [],
			trackScanned: rawData.trackScanned || [],
		};
	}

	private createQueryGetDetail(id: string) {
		const qb =
			this.trackScanStatusRepo.createQueryBuilder('trackScanStatus');

		qb.leftJoin('trackScanStatus.creator', 'creator')
			.leftJoin('trackScanStatus.modifier', 'modifier')

			.addSelect(['creator.id', 'creator.name', 'creator.avatar'])
			.addSelect(['modifier.id', 'modifier.name', 'modifier.avatar'])

			.addSelect((subQ) => {
				return subQ
					.select(
						`
							COALESCE(
							jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title)),
							'[]'::jsonb
							)
						`,
					)
					.from(Track, 't')
					.where(`t.id = ANY(trackScanStatus.trackNeedScanIds)`);
			}, 'trackNeedScan')

			.addSelect((subQ) => {
				return subQ
					.select(
						`
							COALESCE(
							jsonb_agg(jsonb_build_object('id', t2.id, 'title', t2.title)),
							'[]'::jsonb
							)
						`,
					)
					.from(Track, 't2')
					.where(`t2.id = ANY(trackScanStatus.trackScannedIds)`);
			}, 'trackScanned')

			.where('trackScanStatus.id = :id', { id });

		return qb;
	}

	private createQueryGetList(query: QueryGetListTask) {
		const {
			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			status,

			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = query;

		const queryBuilder =
			this.trackScanStatusRepo.createQueryBuilder('trackScanStatus');

		queryBuilder
			.leftJoin('trackScanStatus.creator', 'creator')
			.leftJoin('trackScanStatus.modifier', 'modifier');

		queryBuilder.addSelect([
			'creator.name',
			'creator.avatar',

			'modifier.name',
			'modifier.avatar',
		]);

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`trackScanStatus.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`trackScanStatus.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		if (status) {
			queryBuilder.andWhere(`trackScanStatus.status = :status`, {
				status,
			});
		}

		queryBuilder.orderBy(`trackScanStatus.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
