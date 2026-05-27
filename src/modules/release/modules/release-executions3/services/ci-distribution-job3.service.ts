import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { In, Repository } from 'typeorm';
import {
	QueryGetListCiJob3Dto,
	QueryGroupedCiJob3Dto,
	UpdateCiJob3Dto,
} from '../dtos/ci-distribution-job3.dto';
import {
	CiDistributionJob3,
	CiJobStatus3,
	CiJobType3,
} from '../entites/ci-distribution-job3.entity';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { PageDto } from 'src/common/dtos/common.response.dto';

@Injectable()
export class CiDistributionJob3Service {
	constructor(
		@InjectRepository(CiDistributionJob3)
		private readonly repo: Repository<CiDistributionJob3>,
	) {}

	async createJob(data: {
		type: CiJobType3;
		upc: string | null;
		dspCiCodes: string[];
		releaseExecutionId: string;
		stepId: string;
		releaseId: string | null;
		deliveryEmail?: string | null;
		deliveryEmailSubject?: string | null;
		stepLabel?: string;
	}) {
		const entity = this.repo.create({
			...data,
			status: CiJobStatus3.PENDING,
		});

		return this.repo.save(entity);
	}

	async getList(query: QueryGetListCiJob3Dto) {
		const qb = this.repo.createQueryBuilder('job');

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.status?.length) {
			qb.andWhere('job.status IN (:...status)', { status: query.status });
		}

		if (query.releaseExecutionId) {
			qb.andWhere('job.releaseExecutionId = :releaseExecutionId', {
				releaseExecutionId: query.releaseExecutionId,
			});
		}

		if (query.upc) {
			qb.andWhere('job.upc LIKE :upc', { upc: `%${query.upc}%` });
		}

		orderAndPaging2({ qb, filter: query });

		qb.leftJoin('job.release', 'release');
		qb.addSelect(['release.title']);

		const [items, total] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems: total,
			},
		});
	}

	async getGrouped(query: QueryGroupedCiJob3Dto) {
		const page = Number(query.page || 1);
		const pageSize = Number(query.pageSize || 10);

		const qb = this.repo
			.createQueryBuilder('job') 
			.select('job.type', 'type')
			.addSelect('job.delivery_email', 'deliveryEmail')
			.addSelect('job.delivery_email_subject', 'deliveryEmailSubject')
			.addSelect('DATE(job.created_at)', 'dateGroup')
			.addSelect('MIN(job.sent_at)', 'sentAt')
			.addSelect('ARRAY_AGG(DISTINCT job.upc)', 'upcs')
			.addSelect('ARRAY_AGG(DISTINCT job.status)', 'status')
			.addSelect(
				`JSON_AGG(JSON_BUILD_OBJECT(
					'id', job.id,
					'upc', job.upc,
					'dspCodes', job.dsp_ci_codes,
					'type', job.type,
					'status', job.status,
					'sentAt', job.sent_at,
					'stepLabel', job.step_label,
					'releaseSubmitId', job.release_execution_id,
					'stepId', job.step_id,
					'releaseId', job.release_id,
					'deliveryEmail', job.delivery_email,
					'deliveryEmailSubject', job.delivery_email_subject,
					'createdAt', job.created_at,
					'updatedAt', job.updated_at
				) ORDER BY job.created_at DESC)`,
				'data',
			)
			.groupBy('job.type')
			.addGroupBy('job.delivery_email')
			.addGroupBy('job.delivery_email_subject')
			.addGroupBy('DATE(job.created_at)')
			.orderBy('DATE(job.created_at)', 'DESC');

		if (query.keyword?.length) {
			const keywords = query.keyword.map((k) => `%${k}%`);

			qb.andWhere(
				`(
					job.type ILIKE ANY(:keywords)
					OR job.upc ILIKE ANY(:keywords)
					OR job.delivery_email ILIKE ANY(:keywords)
					OR job.delivery_email_subject ILIKE ANY(:keywords)
				)`,
				{ keywords },
			);
		}

		if (query.type) {
			qb.andWhere('job.type = :type', { type: query.type });
		}

		if (query.dateGroup) {
			qb.andHaving('DATE(MIN(job.created_at)) = :dateGroup', {
				dateGroup: query.dateGroup,
			});
		}

		if (query.status?.length) {
			qb.andHaving('ARRAY_AGG(DISTINCT job.status) && :status', {
				status: query.status,
			});
		}

		if (query.upcs?.length) {
			qb.andHaving('ARRAY_AGG(DISTINCT job.upc) && :upcs', {
				upcs: query.upcs,
			});
		}

		const countQb = qb.clone();

		const totalItems = await countQb
			.select('COUNT(*)::int', 'count')
			.getRawMany()
			.then((rows) => rows.length);

		const items = await qb
			.offset((page - 1) * pageSize)
			.limit(pageSize)
			.getRawMany();

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async findOne(id: string) {
		const job = await this.repo.findOne({
			where: { id },
			relations: {
				releaseExecution: true,
				step: true,
				release: true,
			},
		});

		if (!job) {
			throw new NotFoundException('CI distribution job not found');
		}

		return job;
	}

	async autoSendEmail(ids: string[]) {
		const jobs = await this.repo.find({
			where: { id: In(ids) },
		});

		if (!jobs.length) {
			throw new NotFoundException('No jobs found');
		}

		for (const job of jobs) {
			await this.repo.update(job.id, {
				status: CiJobStatus3.COMPLETED,
				sentAt: new Date(),
			});
		}

		return {
			count: jobs.length,
		};
	}

	async handleDailySend() {
		const jobs = await this.repo.find({
			where: {
				type: CiJobType3.EMAIL_STATE51,
				status: CiJobStatus3.PENDING,
			},
			order: {
				createdAt: 'ASC',
			},
		});

		if (!jobs.length) {
			return;
		}

		await this.autoSendEmail(jobs.map((job) => job.id));
	}

	async downloadExcel(ids: string[]) {
		const jobs = await this.repo.find({
			where: { id: In(ids) },
			order: { createdAt: 'ASC' },
		});

		if (!jobs.length) {
			throw new NotFoundException('No jobs found');
		}

		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet('CI Jobs');

		sheet.columns = [
			{ header: 'UPC', key: 'upc', width: 25 },
			{ header: 'DSP CI Codes', key: 'dspCiCodes', width: 50 },
			{ header: 'Type', key: 'type', width: 20 },
			{ header: 'Status', key: 'status', width: 20 },
		];

		for (const job of jobs) {
			sheet.addRow({
				upc: job.upc,
				dspCiCodes: job.dspCiCodes?.join(', '),
				type: job.type,
				status: job.status,
			});
		}

		for (const job of jobs) {
			await this.repo.update(job.id, {
				status: CiJobStatus3.PROCESSING,
			});
		}

		const buffer = await workbook.xlsx.writeBuffer();

		return {
			buffer: Buffer.from(buffer),
			fileName: `ci-distribution-jobs-${Date.now()}.xlsx`,
		};
	}

	async confirmCompleted(ids: string[], exportIdFromCi?: string) {
		const jobs = await this.repo.find({
			where: { id: In(ids) },
		});

		if (!jobs.length) {
			throw new NotFoundException('No jobs found');
		}

		for (const job of jobs) {
			await this.repo.update(job.id, {
				status: CiJobStatus3.COMPLETED,
				note: exportIdFromCi ?? job.note,
				sentAt: new Date(),
			});
		}

		return {
			count: jobs.length,
		};
	}

	async cancelJob(id: string) {
		await this.findOne(id);

		await this.repo.update(id, {
			status: CiJobStatus3.SKIPPED,
			note: 'Cancelled by admin',
		});

		return this.findOne(id);
	}

	async updateJob(id: string, body: UpdateCiJob3Dto) {
		await this.findOne(id);

		await this.repo.update(id, {
			status: body.status,
			deliveryEmail: body.deliveryEmail,
			deliveryEmailSubject: body.deliveryEmailSubject,
			dspCiCodes: body.dspCiCodes,
		});

		return this.findOne(id);
	}

	findByStepId(stepId: string) {
		return this.repo.find({
			where: { stepId },
			order: { createdAt: 'DESC' },
		});
	}

	findPendingJobs() {
		return this.repo.find({
			where: { status: CiJobStatus3.PENDING },
			order: { createdAt: 'ASC' },
		});
	}
}
