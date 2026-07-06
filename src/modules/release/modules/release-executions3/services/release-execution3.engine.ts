import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorType } from 'src/modules/log/entites/logs.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { Repository } from 'typeorm';
import { ReleaseExecutionResultDto } from '../dtos/release-execution3.dto';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3ResultService } from './release-execution3-result.service';

// organize-imports-ignore
import { ReleaseExecution3WorkerTest } from './release-execution3-test.worker';
// organize-imports-ignore
import { ReleaseExecution3Worker } from './release-execution3.worker';

@Injectable()
export class ReleaseExecutionStepEngine {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		// private readonly releaseExecution3Worker: ReleaseExecution3Worker,
		private readonly releaseExecution3Worker: ReleaseExecution3WorkerTest,
		private readonly releaseExecution3ResultService: ReleaseExecution3ResultService,
		private readonly logService: LogsService,
	) {}

	// main
	async processStep({
		step: STEP,
		releaseExecution,
	}: {
		step: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}): Promise<ReleaseExecutionStepStatus> {
		// Do not start another step after the execution has been cancelled.

		const hasChildren = !!STEP.childSteps?.length;

		// nếu ko có con thì xử lý step
		if (!hasChildren) {
			if (await this.isExecutionCancelled(releaseExecution.id)) {
				return ReleaseExecutionStepStatus.CANCELLED;
			}

			// Skip nếu đã ở trạng thái cuối
			if (
				[
					ReleaseExecutionStepStatus.DONE,
					ReleaseExecutionStepStatus.FAILED,
					ReleaseExecutionStepStatus.CANCELLED,
					ReleaseExecutionStepStatus.SKIPPED,
					ReleaseExecutionStepStatus.WAITING_ACTION,
				].includes(STEP.status)
			) {
				return STEP.status;
			}

			// Skip nếu đang chờ partner và chưa đến giờ
			if (STEP.status === ReleaseExecutionStepStatus.WAITING_PARTNER) {
				const scheduledAt = STEP.metadata?.scheduledAt;
				if (scheduledAt && new Date(scheduledAt) > new Date()) {
					return ReleaseExecutionStepStatus.WAITING_PARTNER;
				}
				// Đã đến giờ → chạy tiếp xuống dưới
			}

			// Chạy task
			await this.updateStepStatus(
				STEP,
				ReleaseExecutionStepStatus.PROCESSING,
			);

			const status = await this.releaseExecution3Worker.dispatchStepTask({
				step: STEP,
				releaseExecution,
			});

			// Cancellation may happen while the worker is running. Keep the
			// PROCESSING step cancelled and do not overwrite it with DONE.
			// if (await this.isExecutionCancelled(releaseExecution.id)) {
			// 	return this.cancelStep(STEP);
			// }

			await this.updateStepStatus(STEP, status);
			return status;
		}

		// nếu có con thì xử lý con
		// Check WAITING_PARTNER trước khi chạy vào children
		if (STEP.status === ReleaseExecutionStepStatus.WAITING_PARTNER) {
			const scheduledAt = STEP.metadata?.scheduledAt;
			if (scheduledAt && new Date(scheduledAt) > new Date()) {
				return ReleaseExecutionStepStatus.WAITING_PARTNER;
			}
			// Đã đến giờ → chạy tiếp
		}

		await this.updateStepStatus(
			STEP,
			ReleaseExecutionStepStatus.PROCESSING,
		);

		if (STEP.childExecutionMode === 'sequential') {
			for (const childStep of STEP.childSteps!) {
				const childStatus = await this.processStep({
					step: childStep,
					releaseExecution,
				});

				if (this.shouldStopSequential(childStatus)) {
					return this.resolveStatusByChild_AndUpdateDb(STEP);
				}
			}

			return this.resolveStatusByChild_AndUpdateDb(STEP);
		}

		if (STEP.childExecutionMode === 'parallel') {
			await Promise.allSettled(
				STEP.childSteps!.map((child) =>
					this.processStep({ step: child, releaseExecution }),
				),
			);

			// for (const child of STEP.childSteps!) {
			// 	await this.processStep({
			// 		step: child,
			// 		releaseExecution,
			// 	});
			// }

			return this.resolveStatusByChild_AndUpdateDb(STEP);
		}

		throw new Error(
			`Unknown childExecutionMode: ${STEP.childExecutionMode}`,
		);
	}

	private async isExecutionCancelled(executionId: string): Promise<boolean> {
		// TODO: Read execution status from cache to avoid recursive N+1 queries.
		return this.executionRepo.exists({
			where: {
				id: executionId,
				status: ReleaseExecutionStatus.CANCELLED,
			},
		});
	}

	// tính toán status cha dựa vào con, lưu db
	private async resolveStatusByChild_AndUpdateDb(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		const status = this.resolveStatusByChild(step);
		await this.updateStepStatus(step, status);
		return status;
	}

	// các trạng thái dừng của sequential
	private shouldStopSequential(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.WAITING_ACTION,
			ReleaseExecutionStepStatus.WAITING_PARTNER,
			ReleaseExecutionStepStatus.CANCELLED,
		].includes(status);
	}

	resolveStatusByChild(
		step: ReleaseExecutionStep3,
	): ReleaseExecutionStepStatus {
		const children = step.childSteps || [];

		if (!children?.length) {
			throw new Error(
				`Step ${step.id} has no children to resolve status from`,
			);
		}

		// ===== WAITING =====
		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.WAITING_ACTION,
			)
		) {
			return ReleaseExecutionStepStatus.WAITING_ACTION;
		}

		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.WAITING_PARTNER,
			)
		) {
			return ReleaseExecutionStepStatus.WAITING_PARTNER;
		}

		// ===== FAILED =====
		if (
			children.some((c) => c.status === ReleaseExecutionStepStatus.FAILED)
		) {
			return ReleaseExecutionStepStatus.FAILED;
		}

		// ===== CANCELLED =====
		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.CANCELLED,
			)
		) {
			return ReleaseExecutionStepStatus.CANCELLED;
		}

		// ===== PROCESSING =====
		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.PROCESSING,
			)
		) {
			return ReleaseExecutionStepStatus.PROCESSING;
		}

		// ===== SKIP =====
		if (
			children.every(
				(c) => c.status === ReleaseExecutionStepStatus.SKIPPED,
			)
		) {
			return ReleaseExecutionStepStatus.DONE;
		}

		// ===== DONE =====
		if (
			children.every((c) => c.status === ReleaseExecutionStepStatus.DONE)
		) {
			return ReleaseExecutionStepStatus.DONE;
		}

		// ===== DEFAULT =====
		return ReleaseExecutionStepStatus.NEW;
	}

	// lưu vào db
	// cập nhật trạng thái status của step,
	// nếu step là delivery step thì đồng thời cập nhật status bên release dsp delivery
	private async updateStepStatus(
		step: ReleaseExecutionStep3,
		status: ReleaseExecutionStepStatus,
	): Promise<void> {
		step.status = status;

		if (!step.startedAt) {
			step.startedAt = new Date();
		}

		if (this.isFinalStatus(status)) {
			step.completedAt = new Date();
		}

		await this.stepRepo.save(step);

		try {
			await this.syncDeliveryStatusByStepStatus(step, status);
		} catch (error) {
			this.logService.error({
				type: ErrorType.SYSTEM,
				module: ReleaseExecutionStepEngine.name,
				releaseExecutionId: step.releaseExecutionId,
				releaseExecutionStepId: step.id,
				message: `Failed to sync delivery status for step ${step.id}`,
				data: {
					error:
						error instanceof Error
							? {
									name: error.name,
									message: error.message,
									stack: error.stack,
								}
							: error,
				},
			});
		}
	}

	isFinalStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.DONE,
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
			ReleaseExecutionStepStatus.SKIPPED,
		].includes(status);
	}

	private async syncDeliveryStatusByStepStatus(
		step: ReleaseExecutionStep3,
		stepStatus: ReleaseExecutionStepStatus,
	): Promise<void> {
		if (!step.isDeliveryStep) return;

		const deliveryStatus = this.mapStepStatusToDeliveryStatus(
			step,
			stepStatus,
		);

		if (!deliveryStatus) return;

		const outputResults: ReleaseExecutionResultDto[] = Array.isArray(
			step.metadata?.output?.result,
		)
			? step.metadata.output.result
			: [];
		const outputResultByDspCode = new Map(
			outputResults
				.filter((item) => !!item.dspCode)
				.map((item) => [item.dspCode.toLowerCase(), item]),
		);

		// Delivery step luôn có danh sách DSP cần xử lý trong input.delivery.items.
		// Map qua mảng dsp trong input xử lý lại status
		// Status ưu tiên lấy từ metadata.output.result theo dspCode;
		// nếu output chưa có DSP đó thì fallback theo stepStatus.
		const delivery = step.metadata?.input?.delivery;
		const results: ReleaseExecutionResultDto[] = (delivery?.items ?? [])
			.filter((item: any) => !!(item.id || item.dspId || item.dspCode))
			.map((item: any) => {
				const outputResult = item.dspCode
					? outputResultByDspCode.get(item.dspCode.toLowerCase())
					: undefined;

				return {
					id: item.id,
					dspId: item.dspId,
					dspCode: item.dspCode,
					dspCodeCi: outputResult?.dspCodeCi ?? item.dspCodeCi,
					status: outputResult?.status ?? deliveryStatus,
				};
			});

		if (!results.length) return;

		await this.releaseExecution3ResultService.updateExecutionOutputResult({
			releaseExecutionId: step.releaseExecutionId,
			releaseExecutionStepId: step.id,
			releaseId: delivery?.releaseId,
			results,
		});
	}

	async syncExecutionOutputToReleaseDeliveryDsp(
		execution: Pick<ReleaseExecution3, 'id'>,
	) {
		await this.releaseExecution3ResultService.syncToReleaseDspDelivery(
			execution.id,
		);
	}

	private mapStepStatusToDeliveryStatus(
		step: ReleaseExecutionStep3,
		stepStatus: ReleaseExecutionStepStatus,
	): ReleaseDspStatus | null {
		// PROCESS_DSPS, PROCESS_AGG_CI chỉ đánh dấu bắt đầu quá trình phân phối, cập nhật status bên release dsp delivery
		// Step này DONE chưa có nghĩa là release đã được phân phối thành công.
		// if (
		// 	step.type === ReleaseExecutionStepType.PROCESS_DSPS ||
		// 	step.type === ReleaseExecutionStepType.PROCESS_AGG_CI
		// ) {
		// 	return stepStatus === ReleaseExecutionStepStatus.PROCESSING
		// 		? ReleaseDspStatus.PROCESSING
		// 		: null;
		// }

		// Delivery step hoàn tất thành công thì DSP được xem là đã phân phối.
		if (stepStatus === ReleaseExecutionStepStatus.DONE) {
			return ReleaseDspStatus.DISTRIBUTED;
		}

		// Các trạng thái kết thúc không thành công đều cần được kiểm tra/xử lý.
		if (
			[
				ReleaseExecutionStepStatus.FAILED,
				ReleaseExecutionStepStatus.CANCELLED,
				ReleaseExecutionStepStatus.SKIPPED,
			].includes(stepStatus)
		) {
			return ReleaseDspStatus.ISSUES;
		}

		// Các trạng thái trung gian khác không làm thay đổi delivery status.
		return null;
	}
}
