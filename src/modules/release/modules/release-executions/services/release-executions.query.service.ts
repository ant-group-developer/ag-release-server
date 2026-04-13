import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Brackets, Repository } from 'typeorm';
import { QueryGetListReleaseExecutionDto } from '../dto/release-execution.dto';
import { ReleaseExecution } from '../entities/release-execution.entity';
import { ExecutionStatus } from '../enum/release-execution.enum';

@Injectable()
export class ReleaseExecutionsQueryService {
	constructor(
		@InjectRepository(ReleaseExecution)
		private readonly executionRepo: Repository<ReleaseExecution>,
	) {}

	private createQbGetList(query: QueryGetListReleaseExecutionDto) {
		const { releaseId, keyword } = query;
		const queryBuilder = this.executionRepo
			.createQueryBuilder('exec')
			.leftJoinAndSelect('exec.release', 'release')
			.leftJoinAndSelect('exec.executionDsps', 'executionDsp')
			.leftJoinAndSelect('executionDsp.dsp', 'dsp')
			.leftJoinAndSelect('executionDsp.steps', 'step');

		if (releaseId) {
			queryBuilder.andWhere('exec.releaseId = :releaseId', { releaseId });
		}

		if (keyword && keyword.length > 0 && keyword[0]) {
			const kw = `%${keyword[0]}%`;
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.where('release.title ILIKE :kw', { kw })
						.orWhere('release.upc ILIKE :kw', { kw })
						.orWhere('dsp.code ILIKE :kw', { kw });
				}),
			);
		}

		return queryBuilder;
	}

	async getList(
		query: QueryGetListReleaseExecutionDto,
	): Promise<[ReleaseExecution[], number]> {
		const { status } = query;
		const queryBuilder = this.createQbGetList(query);

		if (status && status.length > 0) {
			queryBuilder.andWhere('exec.status IN (:...status)', { status });
		}

		// Sử dụng helper function riêng của hệ thống để sort entity ROOT (exec.xxx) và phân trang
		orderAndPaging2({ qb: queryBuilder, filter: query });

		// Gọi DB query, trả về đúng số record pageSize mà k bị mất data
		const [items, count] = await queryBuilder.getManyAndCount();

		// Xử lý bù trừ: Xếp array con thẳng trên RAM (In-Memory Sort)
		for (const exec of items) {
			if (exec.executionDsps) {
				// Sắp xếp executionDsps theo createdAt tăng dần (ASC)
				exec.executionDsps.sort((a, b) => {
					const timeA = a.createdAt
						? new Date(a.createdAt).getTime()
						: 0;
					const timeB = b.createdAt
						? new Date(b.createdAt).getTime()
						: 0;
					return timeA - timeB;
				});

				// Sắp xếp các bước steps bên trong mỗi dsp theo order tăng dần (ASC)
				for (const dsp of exec.executionDsps) {
					if (dsp.steps) {
						dsp.steps.sort(
							(a, b) => (a.order || 0) - (b.order || 0),
						);
					}
				}
			}
		}

		return [items, count];
	}

	async getStatusCounts(
		query: QueryGetListReleaseExecutionDto,
	): Promise<Record<string, number>> {
		const queryBuilder = this.createQbGetList(query);

		queryBuilder
			.select('exec.status', 'status')
			.addSelect('COUNT(DISTINCT exec.id)', 'count')
			.groupBy('exec.status');

		const rawResults = await queryBuilder.getRawMany();

		// Khởi tạo các giá trị = 0
		const counts: Record<string, number> = Object.values(
			ExecutionStatus,
		).reduce(
			(acc, status) => {
				acc[status] = 0;
				return acc;
			},
			{} as Record<string, number>,
		);

		for (const row of rawResults) {
			if (counts[row.status] !== undefined) {
				counts[row.status] = parseInt(row.count, 10);
			}
		}

		return counts;
	}
}
