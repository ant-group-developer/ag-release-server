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
	async processStep({
		step: STEP,
		releaseExecution,
	}: {
		step: ReleaseExecutionStep3;
		releaseExecution: ReleaseExecution3;
	}): Promise<ReleaseExecutionStepStatus> {
		// Skip nếu đã hoàn thành
		if (STEP.status === ReleaseExecutionStepStatus.DONE) {
			return ReleaseExecutionStepStatus.DONE;
		}

		// Skip nếu đang chờ user action — không re-trigger để tránh duplicate job
		// (WAITING_PARTNER không skip vì cron cần re-process để kiểm tra timer)
		if (STEP.status === ReleaseExecutionStepStatus.WAITING_ACTION) {
			return ReleaseExecutionStepStatus.WAITING_ACTION;
		}

		// Skip nếu đang chờ và chưa đến giờ resume
		// if (STEP.status === ReleaseExecutionStepStatus.WAITING_PARTNER) {
		// 	const scheduledAt = STEP.metadata?.scheduledAt;
		// 	if (scheduledAt && new Date(scheduledAt) > new Date()) {
		// 		return ReleaseExecutionStepStatus.WAITING_PARTNER;
		// 	}
		// 	// Đã đến giờ → tiếp tục chạy bình thường xuống dưới
		// }

		await this.updateStepStatus(
			STEP,
			ReleaseExecutionStepStatus.PROCESSING,
		);

		if (!STEP.childSteps?.length) {
			// gọi sang worker để xử lý logic chính của step, lấy về status, lưu db
			const status = await this.releaseExecution3Worker.dispatchStepTask({
				step: STEP,
				releaseExecution,
			});

			// lưu db
			await this.updateStepStatus(STEP, status);
			return status;
		}

		// xử lý tuần tự, các step trong 1 cha sẽ phụ thuộc vào nhau,
		// nếu step trước failed thì các step sau sẽ không chạy nữa,
		// ngược lại nếu step trước done thì mới chạy step sau
		else if (STEP.childExecutionMode === 'sequential') {
			for (const childStep of STEP.childSteps) {
				// gọi đệ quy
				const childStatus = await this.processStep({
					step: childStep,
					releaseExecution,
				});

				// check xem có cần dừng hay ko, xử lí status cha
				if (this.shouldStopSequential(childStatus)) {
					return this.resolveStatusByChild_AndUpdateDb(STEP);
				}
			}

			return this.resolveStatusByChild_AndUpdateDb(STEP);
		}

		// xử lí song song, các step con sẽ không phụ thuộc vào nhau, cùng chạy 1 lúc
		else if (STEP.childExecutionMode === 'parallel') {
			// await Promise.allSettled(
			// 	step.childSteps.map((child) => this.processStep(child)),
			// );

			for (const child of STEP.childSteps) {
				await this.processStep({
					step: child,
					releaseExecution,
				});
			}

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

	private resolveStatusByChild(
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
			children.every(
				(c) => c.status === ReleaseExecutionStepStatus.CANCELLED,
			)
		) {
			return ReleaseExecutionStepStatus.CANCELLED;
		}

		// ===== DONE =====
		if (
			children.every((c) => c.status === ReleaseExecutionStepStatus.DONE)
		) {
			return ReleaseExecutionStepStatus.DONE;
		}

		// ===== PROCESSING =====
		if (
			children.some(
				(c) => c.status === ReleaseExecutionStepStatus.PROCESSING,
			)
		) {
			return ReleaseExecutionStepStatus.PROCESSING;
		}

		// ===== DEFAULT =====
		return ReleaseExecutionStepStatus.NEW;
	}

	// async setRemaining(
	// 	currentStep: ReleaseExecutionStep3,
	// 	allSiblings: ReleaseExecutionStep3[],
	// 	targetStatus: ReleaseExecutionStepStatus,
	// ): Promise<void> {
	// 	const currentIndex = allSiblings.findIndex(
	// 		(sibling) => sibling.id === currentStep.id,
	// 	);

	// 	// Step hiện tại không nằm trong danh sách sibling → bỏ qua
	// 	if (currentIndex === -1) return;

	// 	// Chỉ cancel các step phía sau nếu parent chạy sequential.
	// 	// Parallel mode: các sibling độc lập nhau, 1 thằng fail không ảnh hưởng thằng khác.
	// 	const parentExecutionMode =
	// 		currentStep.parentStep?.childExecutionMode ?? 'sequential';

	// 	if (parentExecutionMode !== 'sequential') return;

	// 	const remainingSteps = allSiblings.slice(currentIndex + 1);

	// 	// Cập nhật status cho tất cả step phía sau và toàn bộ cây con của chúng
	// 	for (const sibling of remainingSteps) {
	// 		await this.setStepAndChildrenStatus(sibling, targetStatus);
	// 	}
	// }

	// // Đệ quy cập nhật status cho step hiện tại và toàn bộ step con
	// private async setStepAndChildrenStatus(
	// 	step: ReleaseExecutionStep3,
	// 	targetStatus: ReleaseExecutionStepStatus,
	// ): Promise<void> {
	// 	if (this.canOverrideStatus(step.status, targetStatus)) {
	// 		step.status = targetStatus;
	// 		step.completedAt =
	// 			targetStatus === ReleaseExecutionStepStatus.NEW
	// 				? null // reset completedAt khi retry
	// 				: new Date();

	// 		// Khi retry (reset về NEW): clear output để worker chạy lại từ đầu.
	// 		// Giữ input nguyên để worker vẫn có đủ dữ liệu.
	// 		if (
	// 			targetStatus === ReleaseExecutionStepStatus.NEW &&
	// 			step.metadata?.output
	// 		) {
	// 			step.metadata = { ...step.metadata, output: null };
	// 		}
	// 	}

	// 	if (step.childSteps?.length) {
	// 		for (const child of step.childSteps) {
	// 			await this.setStepAndChildrenStatus(child, targetStatus);
	// 		}
	// 	}

	// 	await this.stepRepo.save(step);
	// }

	// // Kiểm tra step có được phép override status hay không
	// private canOverrideStatus(
	// 	status: ReleaseExecutionStepStatus,
	// 	targetStatus?: ReleaseExecutionStepStatus,
	// ): boolean {
	// 	// Khi reset về NEW (retry): cho phép override cả FAILED
	// 	if (targetStatus === ReleaseExecutionStepStatus.NEW) {
	// 		return [
	// 			ReleaseExecutionStepStatus.NEW,
	// 			ReleaseExecutionStepStatus.PROCESSING,
	// 			ReleaseExecutionStepStatus.FAILED,
	// 		].includes(status);
	// 	}

	// 	// Khi cancel: chỉ override NEW và PROCESSING
	// 	return [
	// 		ReleaseExecutionStepStatus.NEW,
	// 		ReleaseExecutionStepStatus.PROCESSING,
	// 	].includes(status);
	// }

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

	private isFinalStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.DONE,
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
		].includes(status);
	}

	// Trong ReleaseExecutionStepEngine
	// async resetStepAndChildren(step: ReleaseExecutionStep3): Promise<void> {
	// 	await this.setStepAndChildrenStatus(
	// 		step,
	// 		ReleaseExecutionStepStatus.NEW,
	// 	);
	// }

	// Leo ngược từ step lên root: tại mỗi ancestor load children từ DB,
	// derive status bằng resolveStatusByChild (giống engine) rồi lưu DB.
	// KHÔNG re-run step nào — chỉ cập nhật status cha cho đúng.
	async propagateStatusUp(step: ReleaseExecutionStep3): Promise<void> {
		let currentParentId = step.parentStepId;

		while (currentParentId) {
			const parent = await this.stepRepo.findOne({
				where: { id: currentParentId },
				relations: { childSteps: true }, // load children để derive status
			});

			if (!parent) break;

			const status = this.resolveStatusByChild(parent);

			parent.status = status;
			if (this.isFinalStatus(status)) {
				parent.completedAt = new Date();
			}
			await this.stepRepo.save(parent);

			currentParentId = parent.parentStepId;
		}
	}
}
