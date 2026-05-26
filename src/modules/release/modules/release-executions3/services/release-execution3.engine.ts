import { Injectable, NotFoundException } from '@nestjs/common';
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
	async processStep(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		if (!step.childSteps?.length) {
			const status = await this.releaseExecution3Worker.dispatchStepTask({
				step,
				releaseExecution: step.releaseExecution,
			});
			await this.updateStepStatus(step, status);
			return status;
		} else if (step.childExecutionMode === 'sequential') {
			for (const childStep of step.childSteps) {
				const childStatus = await this.processStep(childStep);

				if (this.shouldStopSequential(childStatus)) {
					await this.setRemaining(
						childStep,
						step.childSteps,
						childStatus,
					);
					return this.resolveAndUpdateParentStatus(step);
				}
			}

			return this.resolveAndUpdateParentStatus(step);
		} else if (step.childExecutionMode === 'parallel') {
			// await Promise.allSettled(
			// 	step.childSteps.map((child) => this.processStep(child)),
			// );

			for (const child of step.childSteps) {
				await this.processStep(child);
			}

			return this.resolveAndUpdateParentStatus(step);
		}

		throw new Error(
			`Unknown childExecutionMode: ${step.childExecutionMode}`,
		);
	}

	private async resolveAndUpdateParentStatus(
		step: ReleaseExecutionStep3,
	): Promise<ReleaseExecutionStepStatus> {
		const status = this.resolveParentStatus(step);
		await this.updateStepStatus(step, status);
		return status;
	}

	async runByStepId(stepId: string) {
		const rootStep = await this.stepRepo.findOne({
			where: { id: stepId },
		});

		if (!rootStep) {
			throw new NotFoundException('Step not found');
		}

		const allSteps = await this.stepRepo.find({
			where: {
				releaseExecutionId: rootStep.releaseExecutionId,
			},
			order: {
				order: 'ASC',
			},
		});

		const tree = this.buildStepTree(allSteps, stepId);

		if (!tree) {
			throw new NotFoundException('Step tree not found');
		}

		const status = await this.processStep(tree);

		return {
			stepId: tree.id,
			type: tree.type,
			status,
		};
	}

	async runByExecutionId(executionId: string) {
		const steps = await this.stepRepo.find({
			where: { releaseExecutionId: executionId },
			order: { order: 'ASC' },
		});

		const roots = this.buildStepTrees(steps);

		for (const root of roots) {
			await this.processStep(root);
		}

		return {
			executionId,
			status: roots.map((step) => ({
				stepId: step.id,
				type: step.type,
				status: step.status,
			})),
		};
	}

	private buildStepTrees(
		steps: ReleaseExecutionStep3[],
	): ReleaseExecutionStep3[] {
		const stepMap = new Map<string, ReleaseExecutionStep3>();
		const roots: ReleaseExecutionStep3[] = [];

		for (const step of steps) {
			step.childSteps = [];
			stepMap.set(step.id, step);
		}

		for (const step of steps) {
			if (!step.parentStepId) {
				roots.push(step);
				continue;
			}

			const parent = stepMap.get(step.parentStepId);

			if (!parent) {
				continue;
			}

			step.parentStep = parent;
			parent.childSteps?.push(step);
		}

		for (const step of steps) {
			step.childSteps?.sort((a, b) => a.order - b.order);
		}

		return roots.sort((a, b) => a.order - b.order);
	}

	private buildStepTree(
		steps: ReleaseExecutionStep3[],
		rootStepId: string,
	): ReleaseExecutionStep3 | null {
		const stepMap = new Map<string, ReleaseExecutionStep3>();

		for (const step of steps) {
			step.childSteps = [];
			stepMap.set(step.id, step);
		}

		for (const step of steps) {
			if (!step.parentStepId) {
				continue;
			}

			const parent = stepMap.get(step.parentStepId);

			if (!parent) {
				continue;
			}

			step.parentStep = parent;
			parent.childSteps?.push(step);
		}

		for (const step of steps) {
			step.childSteps?.sort((a, b) => a.order - b.order);
		}

		return stepMap.get(rootStepId) || null;
	}

	private shouldStopSequential(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.FAILED,
			ReleaseExecutionStepStatus.WAITING_ACTION,
			ReleaseExecutionStepStatus.WAITING_PARTNER,
			ReleaseExecutionStepStatus.CANCELLED,
		].includes(status);
	}

	private resolveParentStatus(
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

	// đánh dấu tất cả các bước còn lại (chưa được xử lý)
	private async setRemaining(
		currentStep: ReleaseExecutionStep3,
		allSiblings: ReleaseExecutionStep3[],
		targetStatus: ReleaseExecutionStepStatus,
	): Promise<void> {
		const currentIndex = allSiblings.findIndex(
			(sibling) => sibling.id === currentStep.id,
		);

		if (currentIndex === -1) {
			return;
		}

		const remainingSteps = allSiblings.slice(currentIndex + 1);

		for (const sibling of remainingSteps) {
			await this.setStepAndChildrenStatus(sibling, targetStatus);
		}
	}

	private async setStepAndChildrenStatus(
		step: ReleaseExecutionStep3,
		targetStatus: ReleaseExecutionStepStatus,
	): Promise<void> {
		if (this.canOverrideStatus(step.status)) {
			step.status = targetStatus;
			step.completedAt = new Date();
		}

		if (step.childSteps?.length) {
			for (const child of step.childSteps) {
				await this.setStepAndChildrenStatus(child, targetStatus);
			}
		}

		await this.stepRepo.save(step);
	}

	private canOverrideStatus(status: ReleaseExecutionStepStatus): boolean {
		return [
			ReleaseExecutionStepStatus.NEW,
			ReleaseExecutionStepStatus.PROCESSING,
		].includes(status);
	}

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
}
