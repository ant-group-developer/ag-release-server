import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';
import { ReleaseExecutionStepStatus } from '../enums/release-execution3.enum';
import { ReleaseExecution3Worker } from './release-execution3.worker';

@Injectable()
export class ReleaseExecutionStepEngine {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		private readonly releaseExecution3Worker: ReleaseExecution3Worker,
	) { }

	// main

	// xử lí toàn bộ thằng con rồi mới xử lí chính nó
	// async processStep({
	// 	step: STEP,
	// 	releaseExecution,
	// }: {
	// 	step: ReleaseExecutionStep3;
	// 	releaseExecution: ReleaseExecution3;
	// }): Promise<ReleaseExecutionStepStatus> {
	// 	// Skip nếu đã hoàn thành
	// 	if (STEP.status === ReleaseExecutionStepStatus.DONE) {
	// 		return ReleaseExecutionStepStatus.DONE;
	// 	}

	// 	// Skip nếu đang chờ user action — không re-trigger để tránh duplicate job
	// 	// (WAITING_PARTNER không skip vì cron cần re-process để kiểm tra timer)
	// 	if (STEP.status === ReleaseExecutionStepStatus.WAITING_ACTION) {
	// 		return ReleaseExecutionStepStatus.WAITING_ACTION;
	// 	}

	// 	// Skip nếu đã fail — không re-trigger các step FAILED không được retry tường minh
	// 	// (step được retry sẽ được reset về NEW trước khi runPipeline, nên sẽ không bị skip)
	// 	if (STEP.status === ReleaseExecutionStepStatus.FAILED) {
	// 		return ReleaseExecutionStepStatus.FAILED;
	// 	}

	// 	// Skip nếu đã bị huỷ
	// 	if (STEP.status === ReleaseExecutionStepStatus.CANCELLED) {
	// 		return ReleaseExecutionStepStatus.CANCELLED;
	// 	}

	// 	// Skip nếu đang chờ và chưa đến giờ resume
	// 	// if (STEP.status === ReleaseExecutionStepStatus.WAITING_PARTNER) {
	// 	// 	const scheduledAt = STEP.metadata?.scheduledAt;
	// 	// 	if (scheduledAt && new Date(scheduledAt) > new Date()) {
	// 	// 		return ReleaseExecutionStepStatus.WAITING_PARTNER;
	// 	// 	}
	// 	// 	// Đã đến giờ → tiếp tục chạy bình thường xuống dưới
	// 	// }

	// 	await this.updateStepStatus(
	// 		STEP,
	// 		ReleaseExecutionStepStatus.PROCESSING,
	// 	);

	// 	if (!STEP.childSteps?.length) {
	// 		// gọi sang worker để xử lý logic chính của step, lấy về status, lưu db
	// 		const status = await this.releaseExecution3Worker.dispatchStepTask({
	// 			step: STEP,
	// 			releaseExecution,
	// 		});

	// 		// lưu db
	// 		await this.updateStepStatus(STEP, status);
	// 		return status;
	// 	}

	// 	// xử lý tuần tự, các step trong 1 cha sẽ phụ thuộc vào nhau,
	// 	// nếu step trước failed thì các step sau sẽ không chạy nữa,
	// 	// ngược lại nếu step trước done thì mới chạy step sau
	// 	else if (STEP.childExecutionMode === 'sequential') {
	// 		for (const childStep of STEP.childSteps) {
	// 			// gọi đệ quy
	// 			const childStatus = await this.processStep({
	// 				step: childStep,
	// 				releaseExecution,
	// 			});

	// 			// check xem có cần dừng hay ko, xử lí status cha
	// 			if (this.shouldStopSequential(childStatus)) {
	// 				return this.resolveStatusByChild_AndUpdateDb(STEP);
	// 			}
	// 		}

	// 		return this.resolveStatusByChild_AndUpdateDb(STEP);
	// 	}

	// 	// xử lí song song, các step con sẽ không phụ thuộc vào nhau, cùng chạy 1 lúc
	// 	else if (STEP.childExecutionMode === 'parallel') {
	// 		// await Promise.allSettled(
	// 		// 	step.childSteps.map((child) => this.processStep(child)),
	// 		// );

	// 		for (const child of STEP.childSteps) {
	// 			await this.processStep({
	// 				step: child,
	// 				releaseExecution,
	// 			});
	// 		}

	// 		return this.resolveStatusByChild_AndUpdateDb(STEP);
	// 	}

	// 	throw new Error(
	// 		`Unknown childExecutionMode: ${STEP.childExecutionMode}`,
	// 	);
	// }

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
			await this.updateStepStatus(STEP, ReleaseExecutionStepStatus.PROCESSING);

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

		await this.updateStepStatus(STEP, ReleaseExecutionStepStatus.PROCESSING);

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
			for (const child of STEP.childSteps!) {
				await this.processStep({
					step: child,
					releaseExecution,
				});
			}

			return this.resolveStatusByChild_AndUpdateDb(STEP);
		}

		throw new Error(`Unknown childExecutionMode: ${STEP.childExecutionMode}`);
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
	}

	isFinalStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.DONE,
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
		].includes(status);
	}
}
