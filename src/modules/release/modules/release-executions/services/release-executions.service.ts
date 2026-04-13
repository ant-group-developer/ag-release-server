import {
	forwardRef,
	Inject,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { EntityManager, In, Repository } from 'typeorm';
import {
	QueryGetListReleaseExecutionDto,
	ReleaseExecutionPageDto,
} from '../dto/release-execution.dto';
import { ReleaseExecutionDsp } from '../entities/release-execution-dsp.entity';
import { ReleaseExecutionStep } from '../entities/release-execution-step.entity';
import { ReleaseExecution } from '../entities/release-execution.entity';
import {
	ExecutionStatus,
	StepStatus,
	StepType,
} from '../enum/release-execution.enum';
import { ReleaseExecutionProcessorService } from './release-execution-processor.service';
import { ReleaseExecutionsQueryService } from './release-executions.query.service';

@Injectable()
export class ReleaseExecutionsService {
	constructor(
		@InjectRepository(ReleaseExecution)
		private executionRepo: Repository<ReleaseExecution>,
		private readonly queryService: ReleaseExecutionsQueryService,

		private readonly releaseExecutionProcessorService: ReleaseExecutionProcessorService,

		@InjectEntityManager()
		private readonly manager: EntityManager,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,

		private readonly fileExportCiService: FileExportCiService,
	) {}

	// C - Create (Placeholder)
	// Lưu ý: Việc Create phức tạp kèm các Step nên được uỷ quyền cho 1 Class riêng là ExecutionPlanner xử lý
	async createAndProcess(data: Partial<ReleaseExecution>) {
		const newExecution = await this.create(data);

		// SYNC: Cập nhật Release sang PROCESSING
		if (newExecution.releaseId) {
			await this.manager.update(Release, newExecution.releaseId, {
				status: ReleaseStatus.PROCESSING,
			});
		}

		await this.releaseExecutionProcessorService.processQueueItem(
			newExecution.id,
		);
		return newExecution;
	}

	async create(data: Partial<ReleaseExecution>) {
		const newExecution = this.executionRepo.create(data);
		return this.executionRepo.save(newExecution);
	}

	// R - Read (List)
	async getList(
		query: QueryGetListReleaseExecutionDto,
	): Promise<ReleaseExecutionPageDto<ReleaseExecution>> {
		const [items, totalItems] = await this.queryService.getList(query);
		const statusCounts = await this.queryService.getStatusCounts(query);

		return new ReleaseExecutionPageDto({
			items,
			metadata: {
				...query,
				totalItems,
				statusCounts,
			},
		});
	}

	// R - Read Execution Dsps
	async getExecutionDsps(id: string) {
		const execution = await this.findOne(id);
		return execution.executionDsps || [];
	}

	// R - Read (One)
	async findOne(id: string) {
		const execution = await this.executionRepo.findOne({
			where: { id },
			relations: {
				release: true,
				executionDsps: {
					dsp: true,
					steps: true,
				},
			},
			order: {
				createdAt: 'DESC',
				executionDsps: {
					createdAt: 'ASC',
					steps: {
						order: 'ASC',
					},
				},
			},
		});

		if (!execution) {
			throw new NotFoundException(
				`ReleaseExecution with ID ${id} not found`,
			);
		}

		return execution;
	}

	// D - Delete
	async remove(id: string) {
		const execution = await this.findOne(id);
		return this.executionRepo.remove(execution);
	}

	// ==========================================
	// MANUAL EXPORT LOGIC (Flow WAITING_EXPORT)
	// ==========================================

	async getManualExportBuffer(executionId: string) {
		const execution = await this.findOne(executionId);

		// Tìm các step WAITING_EXPORT đang ở trạng thái WAITING_ACTION
		const waitingSteps: ReleaseExecutionStep[] = [];
		for (const execDsp of execution.executionDsps) {
			const steps = execDsp.steps.filter(
				(s) =>
					s.stepType === StepType.WAITING_EXPORT &&
					s.status === StepStatus.WAITING_ACTION,
			);
			waitingSteps.push(...steps);
		}

		if (waitingSteps.length === 0) {
			throw new NotFoundException(
				'Không tìm thấy bản ghi nào đang chờ export thủ công',
			);
		}

		const dspCodes = waitingSteps
			.map(
				(s) =>
					execution.executionDsps.find(
						(d) => d.id === s.executionDspId,
					)?.dsp?.code,
			)
			.filter(Boolean) as string[];

		const buffer =
			await this.releaseService.getFileExportListReleaseCiByDspCode({
				ids: [execution.releaseId],
				dspCodeCi: dspCodes,
			});

		return {
			buffer,
			fileName: `Manual_Export_${execution.release.title}_${new Date().getTime()}.xlsx`,
		};
	}

	async markManualExportAsCompleted(executionId: string) {
		const execution = await this.findOne(executionId);
		const now = new Date();

		await this.manager.transaction(async (manager) => {
			for (const execDsp of execution.executionDsps) {
				const steps = execDsp.steps.filter(
					(s) =>
						s.stepType === StepType.WAITING_EXPORT &&
						s.status === StepStatus.WAITING_ACTION,
				);

				if (steps.length > 0) {
					// Update các step sang SUCCESS
					await manager.update(
						ReleaseExecutionStep,
						{ id: In(steps.map((s) => s.id)) },
						{
							status: StepStatus.SUCCESS,
							completedAt: now,
						},
					);

					// Cập nhật ExecDsp sang COMPLETED (vì WAITING_EXPORT là step cuối)
					await manager.update(ReleaseExecutionDsp, execDsp.id, {
						status: ExecutionStatus.COMPLETED,
					});

					// SYNC LEGACY: Cập nhật bảng release_dsp_delivery
					if (execDsp.dspId) {
						await manager.update(
							ReleaseDspDelivery,
							{
								releaseId: execution.releaseId,
								dspId: execDsp.dspId,
							},
							{
								status: ReleaseDspStatus.DISTRIBUTED,
								lastDeliveredAt: now,
							},
						);
					}
				}
			}
		});

		// Trigger processor check lại status cuối cùng của execution
		await this.releaseExecutionProcessorService.runExecutionPlan(
			executionId,
		);
	}

	async downloadAndMarkCompleted(executionId: string) {
		const exportData = await this.getManualExportBuffer(executionId);
		await this.markManualExportAsCompleted(executionId);
		return exportData;
	}

	async retryExecution(id: string, userId: string) {
		const original = await this.findOne(id);

		const newExecution = await this.createAndProcess({
			releaseId: original.releaseId,
			type: original.type,
			originalDspCodes: original.originalDspCodes,
			triggeredById: userId,
		});

		return newExecution;
	}

	// ==========================================
	// BULK MANUAL EXPORT LOGIC
	// ==========================================

	async getBulkManualExportBuffer(executionIds: string[]) {
		const records: { upc: string; listCodeDspCi: string[] }[] = [];
		const validExecutionIds: string[] = [];

		for (const execId of executionIds) {
			try {
				const execution = await this.findOne(execId);
				const waitingSteps: ReleaseExecutionStep[] = [];
				for (const execDsp of execution.executionDsps) {
					const steps = execDsp.steps.filter(
						(s) =>
							s.stepType === StepType.WAITING_EXPORT &&
							s.status === StepStatus.WAITING_ACTION,
					);
					waitingSteps.push(...steps);
				}

				if (waitingSteps.length > 0) {
					const dspCodes = waitingSteps
						.map(
							(s) =>
								execution.executionDsps.find(
									(d) => d.id === s.executionDspId,
								)?.dsp?.code,
						)
						.filter(Boolean) as string[];

					records.push({
						upc: execution.release.upc || '',
						listCodeDspCi: dspCodes,
					});
					validExecutionIds.push(execId);
				}
			} catch (e) {
				// Bỏ qua nếu không tìm thấy hoặc lỗi lẻ tẻ
				this.releaseExecutionProcessorService['logger'].warn(
					`[BULK_EXPORT] Lỗi khi xử lý execution ${execId}: ${e.message}`,
				);
			}
		}

		if (records.length === 0) {
			throw new NotFoundException(
				'Không tìm thấy bản ghi nào đang chờ export thủ công trong danh sách gửi lên',
			);
		}

		const buffer = await this.fileExportCiService.createFileExportCi({
			data: records,
		});

		return {
			buffer,
			fileName: `Bulk_Manual_Export_${new Date().getTime()}.xlsx`,
			validExecutionIds,
		};
	}

	async bulkMarkManualExportAsCompleted(executionIds: string[]) {
		for (const execId of executionIds) {
			await this.markManualExportAsCompleted(execId);
		}
	}

	async bulkDownloadAndMarkCompleted(executionIds: string[]) {
		const result = await this.getBulkManualExportBuffer(executionIds);
		await this.bulkMarkManualExportAsCompleted(result.validExecutionIds);
		return result;
	}
}
