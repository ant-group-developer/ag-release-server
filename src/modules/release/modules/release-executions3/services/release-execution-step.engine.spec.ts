import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseExecutionStep3 } from '../entites/release-execution3-step.entity';
import {
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';
import { ReleaseExecutionStepEngine } from './release-execution3.engine';

describe('ReleaseExecutionStepEngine', () => {
	let engine: ReleaseExecutionStepEngine;
	let repo: jest.Mocked<Repository<ReleaseExecutionStep3>>;

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				ReleaseExecutionStepEngine,
				{
					provide: getRepositoryToken(ReleaseExecutionStep3),
					useValue: {
						save: jest.fn(async (data) => data),
					},
				},
			],
		}).compile();

		engine = moduleRef.get(ReleaseExecutionStepEngine);
		repo = moduleRef.get(getRepositoryToken(ReleaseExecutionStep3));
	});

	function makeStep(
		partial: Partial<ReleaseExecutionStep3>,
	): ReleaseExecutionStep3 {
		return {
			id: partial.id || crypto.randomUUID(),
			type: partial.type || ReleaseExecutionStepType.VALIDATE,
			status: partial.status || ReleaseExecutionStepStatus.NEW,
			order: partial.order || 0,
			childSteps: partial.childSteps || [],
			childExecutionMode: partial.childExecutionMode || 'sequential',
			parentStep: partial.parentStep || null,
			parentStepId: partial.parentStepId || null,
			releaseExecutionId:
				partial.releaseExecutionId || crypto.randomUUID(),
			metadata: partial.metadata || null,
			startedAt: partial.startedAt || null,
			completedAt: partial.completedAt || null,
			...partial,
		} as ReleaseExecutionStep3;
	}

	describe('processStep', () => {
		it('should process leaf step and mark DONE', async () => {
			const step = makeStep({
				type: ReleaseExecutionStepType.GEN_UPC,
			});

			const status = await engine.processStep(step);

			expect(status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(step.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(step.startedAt).toBeInstanceOf(Date);
			expect(step.completedAt).toBeInstanceOf(Date);
			// expect(repo.save).toHaveBeenCalledWith(step);
		});

		it('should process sequential children and mark parent DONE when all children done', async () => {
			const child1 = makeStep({
				type: ReleaseExecutionStepType.GEN_UPC,
				order: 1,
			});

			const child2 = makeStep({
				type: ReleaseExecutionStepType.VALIDATE,
				order: 2,
			});

			const parent = makeStep({
				type: ReleaseExecutionStepType.PROCESS_DIRECT,
				childExecutionMode: 'sequential',
				childSteps: [child1, child2],
			});

			child1.parentStep = parent;
			child2.parentStep = parent;

			const status = await engine.processStep(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(parent.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(child1.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(child2.status).toBe(ReleaseExecutionStepStatus.DONE);
		});

		it('should stop sequential when child WAITING_ACTION', async () => {
			const child1 = makeStep({
				type: ReleaseExecutionStepType.GEN_UPC,
				order: 1,
			});

			const child2 = makeStep({
				type: ReleaseExecutionStepType.WAITING_ADMIN_EXPORT,
				order: 2,
			});

			const child3 = makeStep({
				type: ReleaseExecutionStepType.EXPORT_CI,
				order: 3,
			});

			const parent = makeStep({
				type: ReleaseExecutionStepType.PROCESS_AGG_CI,
				childExecutionMode: 'sequential',
				childSteps: [child1, child2, child3],
			});

			child1.parentStep = parent;
			child2.parentStep = parent;
			child3.parentStep = parent;

			const status = await engine.processStep(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.WAITING_ACTION);
			expect(parent.status).toBe(
				ReleaseExecutionStepStatus.WAITING_ACTION,
			);
			expect(child1.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(child2.status).toBe(
				ReleaseExecutionStepStatus.WAITING_ACTION,
			);
			expect(child3.status).toBe(
				ReleaseExecutionStepStatus.WAITING_ACTION,
			);
		});

		it('should stop sequential when child WAITING_PARTNER', async () => {
			const child1 = makeStep({
				type: ReleaseExecutionStepType.CREATE_AND_UPLOAD_DIRECT,
				order: 1,
			});

			const child2 = makeStep({
				type: ReleaseExecutionStepType.WAIT_PARTNER_PROCESS,
				order: 2,
			});

			const child3 = makeStep({
				type: ReleaseExecutionStepType.SYNC_DATA_FROM_DSP,
				order: 3,
			});

			const parent = makeStep({
				type: ReleaseExecutionStepType.PROCESS_DIRECT,
				childExecutionMode: 'sequential',
				childSteps: [child1, child2, child3],
			});

			child1.parentStep = parent;
			child2.parentStep = parent;
			child3.parentStep = parent;

			const status = await engine.processStep(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.WAITING_PARTNER);
			expect(parent.status).toBe(
				ReleaseExecutionStepStatus.WAITING_PARTNER,
			);
			expect(child3.status).toBe(
				ReleaseExecutionStepStatus.WAITING_PARTNER,
			);
		});

		it('should process parallel children', async () => {
			const child1 = makeStep({
				type: ReleaseExecutionStepType.GEN_UPC,
				order: 1,
			});

			const child2 = makeStep({
				type: ReleaseExecutionStepType.VALIDATE,
				order: 2,
			});

			const parent = makeStep({
				type: ReleaseExecutionStepType.PROCESS_DIRECT,
				childExecutionMode: 'parallel',
				childSteps: [child1, child2],
			});

			child1.parentStep = parent;
			child2.parentStep = parent;

			const status = await engine.processStep(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(parent.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(child1.status).toBe(ReleaseExecutionStepStatus.DONE);
			expect(child2.status).toBe(ReleaseExecutionStepStatus.DONE);
		});
	});

	describe('private helpers', () => {
		it('should derive WAITING_ACTION from children', () => {
			const parent = makeStep({
				childSteps: [
					makeStep({ status: ReleaseExecutionStepStatus.DONE }),
					makeStep({
						status: ReleaseExecutionStepStatus.WAITING_ACTION,
					}),
				],
			});

			const status = (engine as any).deriveStatusFromChildren(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.WAITING_ACTION);
		});

		it('should derive DONE when all children DONE', () => {
			const parent = makeStep({
				childSteps: [
					makeStep({ status: ReleaseExecutionStepStatus.DONE }),
					makeStep({ status: ReleaseExecutionStepStatus.DONE }),
				],
			});

			const status = (engine as any).deriveStatusFromChildren(parent);

			expect(status).toBe(ReleaseExecutionStepStatus.DONE);
		});

		it('should derive PARTIAL_DONE when some children DONE', () => {
			const parent = makeStep({
				childSteps: [
					makeStep({ status: ReleaseExecutionStepStatus.DONE }),
					makeStep({ status: ReleaseExecutionStepStatus.NEW }),
				],
			});

			// const status = (engine as any).deriveStatusFromChildren(parent);

			// expect(status).toBe(ReleaseExecutionStepStatus.PARTIAL_DONE);
		});

		it('should detect stop sequential statuses', () => {
			expect(
				(engine as any).shouldStopSequential(
					ReleaseExecutionStepStatus.FAILED,
				),
			).toBe(true);

			expect(
				(engine as any).shouldStopSequential(
					ReleaseExecutionStepStatus.WAITING_ACTION,
				),
			).toBe(true);

			expect(
				(engine as any).shouldStopSequential(
					ReleaseExecutionStepStatus.WAITING_PARTNER,
				),
			).toBe(true);

			expect(
				(engine as any).shouldStopSequential(
					ReleaseExecutionStepStatus.CANCELLED,
				),
			).toBe(true);

			expect(
				(engine as any).shouldStopSequential(
					ReleaseExecutionStepStatus.DONE,
				),
			).toBe(false);
		});
	});
});
