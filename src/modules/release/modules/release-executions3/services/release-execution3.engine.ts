import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseDspDeliveryService } from 'src/modules/release/services/release-dsp-services/release-dsp-delivery.service';
import { Repository } from 'typeorm';
import { ReleaseExecutionResultDto } from '../dtos/release-execution3.dto';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3WorkerTest } from './release-execution3-test.worker';

@Injectable()
export class ReleaseExecutionStepEngine {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		@InjectRepository(ReleaseExecution3)
		private readonly executionRepo: Repository<ReleaseExecution3>,

		// private readonly releaseExecution3Worker: ReleaseExecution3Worker,
		private readonly releaseExecution3Worker: ReleaseExecution3WorkerTest,
		private readonly releaseDspDeliveryService: ReleaseDspDeliveryService,
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

		// ===== STEP LÁ =====
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

		// ===== STEP CHA =====

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
		await this.syncDeliveryStatusByStepStatus(step, status);
	}

	isFinalStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.DONE,
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
			ReleaseExecutionStepStatus.SKIPPED,
		].includes(status);
	}

	// nếu step là delivery step thì đồng thời cập nhật status bên release dsp delivery
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

		// lấy các dsp cần xử lí của step
		const delivery = step.metadata?.input?.delivery;
		const results: ReleaseExecutionResultDto[] = (delivery?.items ?? [])
			.filter((item: any) => !!(item.id || item.dspId || item.dspCode))
			.map((item: any) => ({
				id: item.id,
				dspId: item.dspId,
				dspCode: item.dspCode,
				status: deliveryStatus,
			}));

		// lưu vào exe, đồng bộ lại vào release dsp delivery
		await this.updateExecutionOutputResult({
			executionId: step.releaseExecutionId,
			results,
		});
	}

	private async updateExecutionOutputResult({
		executionId,
		results,
	}: {
		executionId: string;
		results: ReleaseExecutionResultDto[];
	}): Promise<void> {
		if (!results.length) return;

		// Các delivery step có thể chạy parallel và cùng cập nhật metadata.output.result.
		// Lock execution trong transaction để tránh các step đọc cùng dữ liệu cũ rồi ghi đè kết quả của nhau.
		await this.executionRepo.manager.transaction(async (manager) => {
			const executionRepo = manager.getRepository(ReleaseExecution3);
			const execution = await executionRepo.findOne({
				where: { id: executionId },
				lock: { mode: 'pessimistic_write' },
			});

			if (!execution) return;

			const mergedResults = [
				...(execution.metadata?.output?.result ?? []),
			];

			// Tìm DSP đã tồn tại theo định danh ưu tiên có sẵn, sau đó cập nhật status
			// thay vì thêm bản ghi trùng cho cùng một DSP.
			for (const result of results) {
				const index = mergedResults.findIndex(
					(item) =>
						(item.id && item.id === result.id) ||
						(item.dspId && item.dspId === result.dspId) ||
						(item.dspCode && item.dspCode === result.dspCode),
				);

				if (index >= 0) {
					mergedResults[index] = {
						...mergedResults[index],
						...result,
					};
				} else {
					mergedResults.push(result);
				}
			}

			// Chỉ thay output.result, giữ nguyên input và các output khác trong metadata.
			execution.metadata = {
				...(execution.metadata ?? {}),
				output: {
					...(execution.metadata?.output ?? {}),
					result: mergedResults,
				},
			};

			await executionRepo.save(execution);
		});

		// Chỉ sync delivery sau khi transaction commit để luôn đọc được kết quả merge mới nhất.
		await this.syncExecutionOutputToReleaseDeliveryDsp({ id: executionId });
	}

	async syncExecutionOutputToReleaseDeliveryDsp(
		execution: Pick<ReleaseExecution3, 'id'>,
	) {
		// Đọc lại execution thay vì dùng snapshot cũ của pipeline, vì các delivery step
		// có thể vừa cập nhật metadata.output.result trong những transaction khác.
		const latestExecution = await this.executionRepo.findOne({
			where: { id: execution.id },
		});
		const results = latestExecution?.metadata?.output?.result ?? [];

		if (!latestExecution || !results.length) return;

		// Đồng bộ toàn bộ kết quả hiện tại. Metadata là dữ liệu runtime/jsonb nên
		// normalize status về enum trước khi gọi delivery service.
		const deliveryItems = results.map((result) => ({
			...result,
			status: this.normalizeDeliveryStatus(result.status),
		}));

		await this.releaseDspDeliveryService.updateDeliveryStatus({
			releaseIds: [latestExecution.releaseId],
			items: deliveryItems,
		});
	}

	private normalizeDeliveryStatus(
		status?: ReleaseDspStatus | string,
	): ReleaseDspStatus {
		if (
			status &&
			Object.values(ReleaseDspStatus).includes(status as ReleaseDspStatus)
		) {
			return status as ReleaseDspStatus;
		}

		switch (status?.toLowerCase()) {
			case 'success':
			case 'succeeded':
			case 'completed':
			case 'done':
			case 'transferred':
				return ReleaseDspStatus.DISTRIBUTED;

			case 'processing':
			case 'pending':
			case 'in_progress':
			case 'waiting':
			case 'waiting_action':
			case 'waiting_partner':
				return ReleaseDspStatus.PROCESSING;

			case 'failed':
			case 'failure':
			case 'error':
			case 'issues':
			case 'cancelled':
			case 'canceled':
			case 'skipped':
			default:
				return ReleaseDspStatus.ISSUES;
		}
	}

	private mapStepStatusToDeliveryStatus(
		step: ReleaseExecutionStep3,
		stepStatus: ReleaseExecutionStepStatus,
	): ReleaseDspStatus | null {
		// PROCESS_DSPS chỉ đánh dấu bắt đầu quá trình phân phối, cập nhật status bên release dsp delivery
		// Step này DONE chưa có nghĩa là release đã được phân phối thành công.
		if (step.type === ReleaseExecutionStepType.PROCESS_DSPS) {
			return stepStatus === ReleaseExecutionStepStatus.PROCESSING
				? ReleaseDspStatus.PROCESSING
				: null;
		}

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
