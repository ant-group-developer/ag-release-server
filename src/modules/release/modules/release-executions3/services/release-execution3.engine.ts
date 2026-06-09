import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseDspDeliveryService } from 'src/modules/release/services/release-dsp-services/release-dsp-delivery.service';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecution3Worker } from './release-execution3.worker';

@Injectable()
export class ReleaseExecutionStepEngine {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		private readonly releaseExecution3Worker: ReleaseExecution3Worker,
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
		const hasChildren = !!STEP.childSteps?.length;

		// ===== STEP LÁ =====
		if (!hasChildren) {
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

		const delivery = step.metadata?.input?.delivery;
		const releaseIds = delivery?.releaseId ? [delivery.releaseId] : [];
		const items: {
			id?: string;
			dspId?: string;
			dspCode?: string;
			status: ReleaseDspStatus;
		}[] = (delivery?.items ?? [])
			.filter((item: any) => !!(item.id || item.dspId || item.dspCode))
			.map((item: any) => ({
				id: item.id,
				dspId: item.dspId,
				dspCode: item.dspCode,
				status: deliveryStatus,
			}));

		await this.releaseDspDeliveryService.updateDeliveryStatus({
			releaseIds,
			items,
		});
	}

	private mapStepStatusToDeliveryStatus(
		step: ReleaseExecutionStep3,
		stepStatus: ReleaseExecutionStepStatus,
	): ReleaseDspStatus | null {
		if (step.type === ReleaseExecutionStepType.PROCESS_DSPS) {
			return stepStatus === ReleaseExecutionStepStatus.PROCESSING
				? ReleaseDspStatus.PROCESSING
				: null;
		}

		if (stepStatus === ReleaseExecutionStepStatus.DONE) {
			return ReleaseDspStatus.DISTRIBUTED;
		}

		if (
			[
				ReleaseExecutionStepStatus.FAILED,
				ReleaseExecutionStepStatus.CANCELLED,
				ReleaseExecutionStepStatus.SKIPPED,
			].includes(stepStatus)
		) {
			return ReleaseDspStatus.ISSUES;
		}

		return null;
	}
}
