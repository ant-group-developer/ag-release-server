import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import { ReleaseExecutionStepStatus } from '../enums/release-execution3.enum';
import { ReleaseExecution3Worker } from './release-execution3.worker';

@Injectable()
export class ReleaseExecutionStepEngine {
	constructor(
		@InjectRepository(ReleaseExecutionStep3)
		private readonly stepRepo: Repository<ReleaseExecutionStep3>,

		private readonly releaseExecution3Worker: ReleaseExecution3Worker,
	) {}

	// main

	// xử lí toàn bộ thằng con rồi mới xử lí chính nó
	async processStep(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		if (!step.childSteps?.length) {
			// gọi sang worker để xử lý logic chính của step, lấy về status, lưu db
			const status = await this.releaseExecution3Worker.dispatchStepTask({
				step,
				releaseExecution: step.releaseExecution,
			});

			// lưu db
			await this.updateStepStatus(step, status);
			return status;
		}

		// xử lý tuần tự, các step trong 1 cha sẽ phụ thuộc vào nhau,
		// nếu step trước failed thì các step sau sẽ không chạy nữa,
		// ngược lại nếu step trước done thì mới chạy step sau
		else if (step.childExecutionMode === 'sequential') {
			for (const childStep of step.childSteps) {
				// gọi đệ quy
				const childStatus = await this.processStep(childStep);

				// check xem có cần dừng hay ko, nếu có thì udpate những thằng step con còn lại, xử lí status cha
				if (this.shouldStopSequential(childStatus)) {
					await this.setRemaining(
						childStep,
						step.childSteps,
						childStatus,
					);

					return this.resolveStatusByChild_AndUpdateDb(step);
				}
			}

			return this.resolveStatusByChild_AndUpdateDb(step);
		}

		// xử lí song song, các step con sẽ không phụ thuộc vào nhau, cùng chạy 1 lúc
		else if (step.childExecutionMode === 'parallel') {
			// await Promise.allSettled(
			// 	step.childSteps.map((child) => this.processStep(child)),
			// );

			for (const child of step.childSteps) {
				await this.processStep(child);
			}

			return this.resolveStatusByChild_AndUpdateDb(step);
		}

		throw new Error(
			`Unknown childExecutionMode: ${step.childExecutionMode}`,
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

	// Khi một step bị FAILED, CANCELLED, WAITING_ACTION...
	// thì các step phía sau trong cùng level và toàn bộ cây con của chúng cũng bị cập nhật status theo.
	private async setRemaining(
		currentStep: ReleaseExecutionStep3,
		allSiblings: ReleaseExecutionStep3[],
		targetStatus: ReleaseExecutionStepStatus,
	): Promise<void> {
		// Tìm vị trí của step hiện tại trong danh sách sibling
		const currentIndex = allSiblings.findIndex(
			(sibling) => sibling.id === currentStep.id,
		);

		// Nếu không tìm thấy thì bỏ qua
		if (currentIndex === -1) {
			return;
		}

		// Lấy tất cả step phía sau current step
		const remainingSteps = allSiblings.slice(currentIndex + 1);

		// Cập nhật status cho các step còn lại và toàn bộ cây con của chúng
		for (const sibling of remainingSteps) {
			await this.setStepAndChildrenStatus(sibling, targetStatus);
		}
	}

	// Đệ quy cập nhật status cho step hiện tại và toàn bộ step con
	private async setStepAndChildrenStatus(
		step: ReleaseExecutionStep3,
		targetStatus: ReleaseExecutionStepStatus,
	): Promise<void> {
		// Chỉ override các step còn đang chạy hoặc chưa xử lý
		if (this.canOverrideStatus(step.status)) {
			step.status = targetStatus;
			step.completedAt = new Date();
		}

		// Tiếp tục cập nhật toàn bộ cây con
		if (step.childSteps?.length) {
			for (const child of step.childSteps) {
				await this.setStepAndChildrenStatus(child, targetStatus);
			}
		}

		// Lưu trạng thái mới xuống DB
		await this.stepRepo.save(step);
	}

	// Kiểm tra step có được phép override status hay không
	private canOverrideStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.NEW,
			ReleaseExecutionStepStatus.PROCESSING,
		].includes(status);
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

	private isFinalStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.DONE,
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.CANCELLED,
		].includes(status);
	}

	//
	// async runByStepId(stepId: string) {
	// 	const rootStep = await this.stepRepo.findOne({
	// 		where: { id: stepId },
	// 	});

	// 	if (!rootStep) {
	// 		throw new NotFoundException('Step not found');
	// 	}

	// 	const allSteps = await this.stepRepo.find({
	// 		where: {
	// 			releaseExecutionId: rootStep.releaseExecutionId,
	// 		},
	// 		order: {
	// 			order: 'ASC',
	// 		},
	// 	});

	// 	const tree = this.buildStepTree(allSteps, stepId);

	// 	if (!tree) {
	// 		throw new NotFoundException('Step tree not found');
	// 	}

	// 	const status = await this.processStep(tree);

	// 	return {
	// 		stepId: tree.id,
	// 		type: tree.type,
	// 		status,
	// 	};
	// }

	// private buildStepTree(
	// 	steps: ReleaseExecutionStep3[],
	// 	rootStepId: string,
	// ): ReleaseExecutionStep3 | null {
	// 	const stepMap = new Map<string, ReleaseExecutionStep3>();

	// 	for (const step of steps) {
	// 		step.childSteps = [];
	// 		stepMap.set(step.id, step);
	// 	}

	// 	for (const step of steps) {
	// 		if (!step.parentStepId) {
	// 			continue;
	// 		}

	// 		const parent = stepMap.get(step.parentStepId);

	// 		if (!parent) {
	// 			continue;
	// 		}

	// 		step.parentStep = parent;
	// 		parent.childSteps?.push(step);
	// 	}

	// 	for (const step of steps) {
	// 		step.childSteps?.sort((a, b) => a.order - b.order);
	// 	}

	// 	return stepMap.get(rootStepId) || null;
	// }

	// async runByExecutionId(executionId: string) {
	// 	const steps = await this.stepRepo.find({
	// 		where: { releaseExecutionId: executionId },
	// 		order: { order: 'ASC' },
	// 	});

	// 	const roots = this.buildStepTrees(steps);

	// 	for (const root of roots) {
	// 		await this.processStep(root);
	// 	}

	// 	return {
	// 		executionId,
	// 		status: roots.map((step) => ({
	// 			stepId: step.id,
	// 			type: step.type,
	// 			status: step.status,
	// 		})),
	// 	};
	// }

	// private buildStepTrees(
	// 	steps: ReleaseExecutionStep3[],
	// ): ReleaseExecutionStep3[] {
	// 	const stepMap = new Map<string, ReleaseExecutionStep3>();
	// 	const roots: ReleaseExecutionStep3[] = [];

	// 	for (const step of steps) {
	// 		step.childSteps = [];
	// 		stepMap.set(step.id, step);
	// 	}

	// 	for (const step of steps) {
	// 		if (!step.parentStepId) {
	// 			roots.push(step);
	// 			continue;
	// 		}

	// 		const parent = stepMap.get(step.parentStepId);

	// 		if (!parent) {
	// 			continue;
	// 		}

	// 		step.parentStep = parent;
	// 		parent.childSteps?.push(step);
	// 	}

	// 	for (const step of steps) {
	// 		step.childSteps?.sort((a, b) => a.order - b.order);
	// 	}

	// 	return roots.sort((a, b) => a.order - b.order);
	// }
}
