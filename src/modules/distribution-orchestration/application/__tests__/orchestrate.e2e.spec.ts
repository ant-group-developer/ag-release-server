import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelState } from '../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { CreateDistributionProps } from '../../domain/distribution/distribution.types';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDeliveryStatusReader } from '../../infrastructure/test-doubles/in-memory-delivery-status-reader';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryIdentifierProvisioner } from '../../infrastructure/test-doubles/in-memory-identifier-provisioner';
import { InMemoryPackageBuilder } from '../../infrastructure/test-doubles/in-memory-package-builder';
import { InMemoryPackageUploader } from '../../infrastructure/test-doubles/in-memory-package-uploader';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { InMemoryWorkflowAdapter } from '../../infrastructure/workflow/in-memory-workflow.adapter';
import { DistributionCommand } from '../commands/distribution.command';
import { OrchestrateHandler } from '../orchestrate.handler';
import { DefaultPolicyResolver } from '../policy-resolver';
import { QUEUES, QueueName } from '../ports/workflow-engine.port';
import { BuildPackageRunner } from '../step-runners/build-package.runner';
import { ProvisionIdRunner } from '../step-runners/provision-id.runner';
import { SftpUploadRunner } from '../step-runners/sftp-upload.runner';
import { StatusSyncRunner } from '../step-runners/status-sync.runner';

/**
 * E2E — SUBMIT → LIVE cho 1 channel SPOTIFY (spotify.initial: deliver → partner).
 *
 * Kịch bản:
 *   1. SUBMIT command → handler ghi VALIDATING, outbox rỗng.
 *   2. Test giả external validator → MARK_VALIDATED → PROVISIONING_IDS, outbox: dist.provision-id.
 *   3. Loop driver: consume outbox, dispatch job → runner → nhận command kế → feed handler → ...
 *      cho tới khi state DISTRIBUTED (terminal).
 *
 * Loop driver = giả lập outbox-relay (Step 6) + runner dispatcher (Step 8 BullMQ):
 *   · Đổ savedOutbox vào InMemoryWorkflowAdapter (relay OK path)
 *   · Consume due jobs, pick runner theo queue, chạy runner.run(payload)
 *   · Runner trả command → handler.handle(command)
 *   · Nếu channel WAIT → status reader set 'live' trước, advanceTime để job due
 *
 * Test này KHÔNG cover retry/backoff/ISSUES — chỉ happy path SUBMIT → LIVE.
 */
describe('Distribution E2E — SUBMIT → LIVE (spotify.initial)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const RELEASE_ID = '22222222-2222-2222-2222-222222222222';
	const SNAPSHOT_ID = '33333333-3333-3333-3333-333333333333';
	const TENANT_ID = '44444444-4444-4444-4444-444444444444';

	function createProps(): CreateDistributionProps {
		const specs: ChannelDeliverySpec[] = [
			{
				dspCode: 'SPOTIFY',
				topology: ChannelTopology.DIRECT,
				processCode: 'spotify.initial',
			},
		];
		return {
			id: DIST_ID,
			releaseId: RELEASE_ID,
			snapshotId: SNAPSHOT_ID,
			tenantId: TENANT_ID,
			type: ExecutionTypeEnum.INITIAL_RELEASE,
			correlationId: 'corr-e2e',
			channelSpecs: specs,
		};
	}

	it('drives distribution through PROVISIONING → BUILD → UPLOAD → PARTNER wake → LIVE → DISTRIBUTED', async () => {
		// ── Infra ──
		const uow = new InMemoryUnitOfWork();
		const repo = new InMemoryDistributionRepository();
		const clock = new FixedClock(new Date('2026-07-17T10:00:00Z'));
		const workflow = new InMemoryWorkflowAdapter();

		// Port fakes
		const provisioner = new InMemoryIdentifierProvisioner();
		const builder = new InMemoryPackageBuilder();
		const uploader = new InMemoryPackageUploader();
		const statusReader = new InMemoryDeliveryStatusReader();

		// Handler + runners
		const handler = new OrchestrateHandler(
			uow,
			repo,
			new DefaultPolicyResolver(),
			clock,
		);
		const runners: Record<
			QueueName,
			undefined | { run: (p: any) => Promise<any> }
		> = {
			[QUEUES.ORCHESTRATE]: undefined, // orchestrate consumed by handler, not runner
			[QUEUES.VALIDATE]: undefined, // Khối A added; E2E test uses MARK_VALIDATED directly (skip validation)
			[QUEUES.PROVISION_ID]: new ProvisionIdRunner(
				uow,
				repo,
				provisioner,
			),
			[QUEUES.BUILD_PACKAGE]: new BuildPackageRunner(uow, repo, builder),
			[QUEUES.SFTP_UPLOAD]: new SftpUploadRunner(uow, repo, uploader),
			[QUEUES.CI_IMPORT_CHECK]: undefined,
			[QUEUES.CI_QA_CHECK]: undefined,
			[QUEUES.EXPORT_BATCH]: undefined,
			[QUEUES.STATUS_SYNC]: new StatusSyncRunner(uow, repo, statusReader),
		};

		// ── Helper: sync outbox → workflow adapter (giả outbox-relay Step 6) ──
		let dispatchedCount = 0;
		async function drainOutboxToWorkflow(): Promise<void> {
			const pending = repo.savedOutbox.slice(dispatchedCount);
			for (const entry of pending) {
				await workflow.enqueue(entry.queue, entry.payload as any, {
					jobId: entry.jobId,
				});
			}
			dispatchedCount = repo.savedOutbox.length;
		}

		// ── Helper: drain 1 due job → runner → feed handler với command trả về ──
		async function drainOneJob(): Promise<boolean> {
			const job = workflow.consume();
			if (!job) return false;
			const runner = runners[job.queue];
			if (!runner) {
				// Skip queues not in test scope (e.g., dist.validate khi test bypass validation)
				return true;
			}
			const cmd = (await runner.run(
				job.payload,
			)) as DistributionCommand | null;
			if (cmd) await handler.handle(cmd);
			return true;
		}

		// ── STEP 1: SUBMIT ──
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'submit-k1',
			create: createProps(),
		});
		expect((await uow.run((ctx) => repo.load(ctx, DIST_ID)))!.state).toBe(
			DistributionState.VALIDATING,
		);

		// ── STEP 2: External validator OK → MARK_VALIDATED ──
		// Note: buildOutbox VALIDATING → dist.validate job, nhưng test này bypass validation
		// bằng cách gọi MARK_VALIDATED trực tiếp. Drain để clear dist.validate job.
		await drainOutboxToWorkflow();
		await drainOneJob(); // Skip dist.validate job

		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'val-k1',
			requiresReview: false,
		});
		expect((await uow.run((ctx) => repo.load(ctx, DIST_ID)))!.state).toBe(
			DistributionState.PROVISIONING_IDS,
		);

		// ── STEP 3: Drain PROVISIONING_IDS → BUILDING_PACKAGE → DELIVERING (upload) ──
		await drainOutboxToWorkflow();
		// dist.provision-id → MARK_IDS_PROVISIONED → BUILDING_PACKAGE + outbox build-package
		expect(await drainOneJob()).toBe(true);
		expect((await uow.run((ctx) => repo.load(ctx, DIST_ID)))!.state).toBe(
			DistributionState.BUILDING_PACKAGE,
		);

		await drainOutboxToWorkflow();
		// dist.build-package → MARK_PACKAGE_BUILT → DELIVERING + outbox per-channel upload
		expect(await drainOneJob()).toBe(true);
		expect((await uow.run((ctx) => repo.load(ctx, DIST_ID)))!.state).toBe(
			DistributionState.DELIVERING,
		);

		// ── STEP 4: SFTP upload channel-0 → STEP_DONE → WAIT PARTNER ──
		await drainOutboxToWorkflow();
		// dist.sftp-upload → APPLY_CHANNEL_INPUT{STEP_DONE} → channel WAITING (partner)
		expect(await drainOneJob()).toBe(true);
		let loaded = (await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		expect(loaded.state).toBe(DistributionState.DELIVERING);
		expect(loaded.channels[0].state).toBe(ChannelState.WAITING);

		// ── STEP 5: Simulate DSP live → status-sync ARRIVED → channel LIVE → DISTRIBUTED ──
		// StatusSyncRunner queries the reader by UPC (CI API B10 uses ?gtin={{upc}}),
		// so key the simulated live status by the aggregate's provisioned UPC.
		statusReader.setStatus(loaded.upc!, 'SPOTIFY', 'live');
		await drainOutboxToWorkflow();
		expect(await drainOneJob()).toBe(true);
		loaded = (await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		expect(loaded.channels[0].state).toBe(ChannelState.LIVE);
		expect(loaded.state).toBe(DistributionState.DISTRIBUTED);

		// ── Assert: event stream có các milestone chính ──
		const eventTypes = repo.savedEvents.map((e) => e.type);
		expect(eventTypes).toContain('DistributionSubmitted');
		expect(eventTypes).toContain('Validated');
		expect(eventTypes).toContain('IdsProvisioned');
		expect(eventTypes).toContain('PackageBuilt');
		expect(eventTypes).toContain('ChannelLive');
		expect(eventTypes).toContain('Distributed');

		// Every outbox entry got dispatched
		expect(dispatchedCount).toBe(repo.savedOutbox.length);
	});
});
