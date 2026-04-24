import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { ReleaseDspDelivery } from 'src/modules/release/entities/release-dsp-delivery.entity';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import { ReleaseDdexService } from 'src/modules/release/services/release-ddex.service';
import { ReleaseQueryService } from 'src/modules/release/services/release.query.service';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { ReleaseValidateService } from 'src/modules/release/services/release.validate.service';
import { TrackService } from 'src/modules/track/services/track.service';
import { NotificationResendService } from 'src/modules/notification/services/notification.resend-service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import { removeFolder } from 'src/utils/util';
import * as path from 'path';
import { EntityManager, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { ReleaseSubmitStep } from '../entities/release-submit-step.entity';
import { ReleaseSubmit } from '../entities/release-submit.entity';
import {
	ReleaseSubmitStatus,
	SubmitStepStatus,
	SubmitStepType,
} from '../release-submit.enum';
import { ReleaseSubmitLogService } from './release-submit-log.service';
import { QueryGetListSubmitDto } from '../dto/release-submit.dto';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';

@Injectable()
export class ReleaseSubmitService {

	private readonly DISTRIBUTION_TYPES = [SubmitStepType.PROCESS_DIRECT, SubmitStepType.PROCESS_AGG_CI];

	constructor(
		@InjectRepository(ReleaseSubmit)
		private readonly submitRepo: Repository<ReleaseSubmit>,

		@InjectRepository(ReleaseSubmitStep)
		private readonly stepRepo: Repository<ReleaseSubmitStep>,

		@InjectEntityManager()
		private readonly manager: EntityManager,

		private readonly releaseQueryService: ReleaseQueryService,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly releaseDdexService: ReleaseDdexService,
		private readonly sftpConnectService: SftpConnectService,
		private readonly trackService: TrackService,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,
		private readonly submitLog: ReleaseSubmitLogService,
		private readonly notificationResendService: NotificationResendService,
		private readonly fileExportCiService: FileExportCiService,
	) {}

	// ==========================================
	// 1. CREATE — User bấm Submit
	// ==========================================

	async submit(releaseId: string, dspCodes: string[]) {
		// Lấy full release data để snapshot
		const release =
			await this.releaseQueryService.findOneReleaseFull(releaseId);

		// Tạo ReleaseSubmit ở trạng thái NEW
		const submit = this.submitRepo.create({
			releaseId,
			status: ReleaseSubmitStatus.NEW,
			metadata: {
				input: {
					dspCodes,
					releaseSnapshot: release,
				},
			},
		});
		const saved = await this.submitRepo.save(submit);

		this.submitLog.log({
			releaseSubmitId: saved.id,
			message: 'Submit created, starting async processing',
			data: { releaseId, dspCodes },
		});

		// Fire-and-forget: bắt đầu xử lý bất đồng bộ
		this.processAsync(saved.id).catch((err) => {
			this.submitLog.error({
				releaseSubmitId: saved.id,
				message: `processAsync failed: ${err.message}`,
				data: { stack: err.stack },
			});
		});

		return saved;
	}

	// ==========================================
	// 2. PLAN + EXECUTE — Chạy bất đồng bộ
	// ==========================================

	private async processAsync(submitId: string) {
		const submit = await this.findOne(submitId);
		const dspCodes = submit.metadata?.input?.dspCodes || [];
		try {
			// Phase 1: Tạo toàn bộ steps (plan)
			await this.buildPipeline(submitId, dspCodes);

			// Phase 2: Chạy tuần tự các parent steps
			await this.runPipeline(submitId);
		} catch (err) {
			this.submitLog.error({
				releaseSubmitId: submitId,
				message: `Fatal error: ${err.message}`,
				data: { stack: err.stack },
			});
			await this.submitRepo.update(submitId, {
				status: ReleaseSubmitStatus.FAILED,
				summary: err.message,
			});
		}
	}

	// ==========================================
	// PHASE 1: PLAN — Tạo tất cả steps vào DB
	// ==========================================

	private async buildPipeline(submitId: string, dspCodes: string[]) {
		await this.submitRepo.update(submitId, {
			status: ReleaseSubmitStatus.PROCESSING,
		});

		const submit = await this.findOne(submitId);
		const snapshot = submit.metadata?.input?.releaseSnapshot;

		const stepsToInsert: Partial<ReleaseSubmitStep>[] = [];
		let parentOrder = 1;

		// --- Simple steps ---

		// GEN_UPC (nếu chưa có UPC)
		if (!snapshot?.upc) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.GEN_UPC,
				order: parentOrder++,
			});
		}

		// GEN_ISRCS (nếu có track thiếu ISRC)
		const tracksWithoutIsrc =
			snapshot?.tracks?.filter((t: any) => !t.isrc) || [];
		if (tracksWithoutIsrc.length > 0) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.GEN_ISRCS,
				order: parentOrder++,
				metadata: {
					input: {
						trackIds: tracksWithoutIsrc.map((t: any) => t.id),
					},
				},
			});
		}

		// VALIDATE
		stepsToInsert.push({
			releaseSubmitId: submitId,
			type: SubmitStepType.VALIDATE,
			order: parentOrder++,
		});

		// --- DSP steps ---
		let dsps: Dsp[] = [];
		if (dspCodes?.length) {
			dsps = await this.manager.find(Dsp, {
				where: { code: In(dspCodes) },
				relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
			});
		}

		// Phân loại DSPs: direct vs CI aggregator
		const directDsps: Dsp[] = [];
		const ciDsps: Dsp[] = [];

		for (const dsp of dsps) {
			const config = dsp.dspRoutingConfig;
			const isCI =
				config?.mode === RoutingModeEnum.AGGREGATOR &&
				config.aggregator?.code === 'CI';

			if (isCI) {
				ciDsps.push(dsp);
			} else {
				directDsps.push(dsp);
			}
		}

		// PROCESS_DIRECT — 1 parent step per DSP
		for (const dsp of directDsps) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.PROCESS_DIRECT,
				order: parentOrder++,
				metadata: { input: { dsps: [dsp] } },
			});
		}

		// PROCESS_AGG_CI — 1 parent step cho tất cả CI DSPs
		if (ciDsps.length > 0) {
			stepsToInsert.push({
				releaseSubmitId: submitId,
				type: SubmitStepType.PROCESS_AGG_CI,
				order: parentOrder++,
				metadata: { input: { dsps: ciDsps } },
			});
		}

		// Save parent steps
		const savedParents = await this.stepRepo.save(
			stepsToInsert.map((s) => this.stepRepo.create(s)),
		);

		// --- Child steps ---
		const childStepsToInsert: Partial<ReleaseSubmitStep>[] = [];

		for (const parent of savedParents) {
			if (parent.type === SubmitStepType.GEN_ISRCS) {
				// 1 child per track
				const trackIds =
					parent.metadata?.input?.trackIds || [];
				trackIds.forEach((trackId: string, i: number) => {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type: SubmitStepType.GEN_ISRC,
						order: i + 1,
						metadata: { input: { trackId } },
					});
				});
			}

			if (parent.type === SubmitStepType.PROCESS_DIRECT) {
				const directChildTypes = [
					SubmitStepType.CREATE_METADATA_DIRECT,
					SubmitStepType.UPLOAD_SFTP_DIRECT,
					SubmitStepType.WAIT_PARTNER_PROCESS,
					SubmitStepType.SYNC_DATA_FROM_DSP,
				];
				directChildTypes.forEach((type, i) => {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type,
						order: i + 1,
					});
				});
			}

			if (parent.type === SubmitStepType.PROCESS_AGG_CI) {
				const ciDsps: Dsp[] = parent.metadata?.input?.dsps || [];
				const upc = snapshot?.upc;

				// Tách DSPs: có deal CI vs cần State51
				const ciDealDsps = ciDsps.filter((d: Dsp) => d.hasDeal);
				const state51Dsps = ciDsps.filter((d: Dsp) => !d.hasDeal);

				let childOrder = 1;

				// Steps chung — luôn tạo
				const commonTypes = [
					SubmitStepType.CREATE_METADATA_CI,
					SubmitStepType.UPLOAD_SFTP_CI,
					SubmitStepType.CREATE_FOLDER_DONE_CI,
					SubmitStepType.WAIT_PARTNER_PROCESS,
					SubmitStepType.GET_QA_FLAG_CI,
				];
				
				for (const type of commonTypes) {
					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type,
						order: childOrder++,
					});
				}

				// SEND_EMAIL_TO_STATE — chỉ tạo nếu có DSP cần State51
				if (state51Dsps.length > 0) {
					const state51DspCodes = state51Dsps
						.map((d: Dsp) => d.codeCi)
						.filter((code: string): code is string => !!code);

					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type: SubmitStepType.SEND_EMAIL_TO_STATE,
						order: childOrder++,
						metadata: { input: { upc, ciDspCodes: state51DspCodes, dsps:state51Dsps } },
					});
				}

				// WAITING_ADMIN_EXPORT — chỉ tạo nếu có DSP có deal CI
				if (ciDealDsps.length > 0) {
					const ciDealDspCodes = ciDealDsps
						.map((d: Dsp) => d.codeCi)
						.filter((code: string): code is string => !!code);

					childStepsToInsert.push({
						releaseSubmitId: submitId,
						parentStepId: parent.id,
						type: SubmitStepType.WAITING_ADMIN_EXPORT,
						order: childOrder++,
						metadata: { input: { upc, ciDspCodes: ciDealDspCodes, dsps: ciDealDsps } },
					});
				}

				// SYNC_DATA_DSP_CI — luôn tạo, sync tất cả ciDsps
				childStepsToInsert.push({
					releaseSubmitId: submitId,
					parentStepId: parent.id,
					type: SubmitStepType.SYNC_DATA_DSP_CI,
					order: childOrder++,
				});
			}
		}

		if (childStepsToInsert.length > 0) {
			await this.stepRepo.save(
				childStepsToInsert.map((s) => this.stepRepo.create(s)),
			);
		}

		this.submitLog.success({
			releaseSubmitId: submitId,
			message: `Plan created: ${savedParents.length} parent steps, ${childStepsToInsert.length} child steps`,
			data: { parentTypes: savedParents.map(s => s.type) },
		});
	}

	// ==========================================
	// PHASE 2: EXECUTE — Chạy tuần tự
	// ==========================================

	private async runPipeline(submitId: string) {
		// Lấy tất cả parent steps (theo order)
		const parentSteps = await this.stepRepo.find({
			where: { releaseSubmitId: submitId, parentStepId: IsNull() },
			order: { order: 'ASC' },
			relations: ['childSteps'],
		});

		// Phân loại: critical (blocking) vs distribution (independent branches)
		const criticalSteps = parentSteps.filter(s => !this.DISTRIBUTION_TYPES.includes(s.type));
		const distributionSteps = parentSteps.filter(s => this.DISTRIBUTION_TYPES.includes(s.type));

		// Phase 1: Critical steps — tuần tự, fail = dừng toàn bộ
		for (const step of criticalSteps) {
			if (step.status === SubmitStepStatus.DONE) continue;
			if (step.status === SubmitStepStatus.SKIPPED) continue;

			const success = await this.runParentStep(step);
			if (!success) {
				// Critical fail → skip tất cả, submit FAILED
				await this.skipRemainingSteps(submitId, 0);
				await this.submitRepo.update(submitId, {
					status: ReleaseSubmitStatus.FAILED,
					completedAt: new Date(),
				});
				this.submitLog.error({
					releaseSubmitId: submitId,
					releaseSubmitStepId: step.id,
					message: `Critical step ${step.type} failed, submit marked FAILED`,
				});
				return;
			}
		}

		// Phase 2: Distribution steps — chạy song song, các branch độc lập
		const pendingDistSteps = distributionSteps.filter(
			s => s.status !== SubmitStepStatus.DONE && s.status !== SubmitStepStatus.SKIPPED,
		);
		await Promise.allSettled(
			pendingDistSteps.map(step => this.runParentStep(step)),
		);

		// Phase 3: Tính toán submit status cuối cùng từ kết quả các branches
		await this.resolveSubmitStatus(submitId);
	}

	/**
	 * Tính submit status từ trạng thái các distribution branches.
	 * - Tất cả DONE → DONE
	 * - Có WAITING_ACTION → WAITING_ACTION
	 * - Mix DONE + FAILED → PARTIAL_DONE
	 * - Tất cả FAILED → FAILED
	 */
	private async resolveSubmitStatus(submitId: string) {
		const distSteps = await this.stepRepo.find({
			where: {
				releaseSubmitId: submitId,
				parentStepId: IsNull(),
			},
		});

		const distBranches = distSteps.filter(s => this.DISTRIBUTION_TYPES.includes(s.type as SubmitStepType));

		// Nếu không có distribution branches (chỉ có critical steps) → DONE
		if (distBranches.length === 0) {
			await this.submitRepo.update(submitId, {
				status: ReleaseSubmitStatus.DONE,
				completedAt: new Date(),
			});
			this.submitLog.success({ releaseSubmitId: submitId, message: 'All steps completed (no distribution branches)' });
			return;
		}

		const statuses = distBranches.map(s => s.status);
		const hasWaiting = statuses.includes(SubmitStepStatus.WAITING_ACTION);
		const hasFailed = statuses.includes(SubmitStepStatus.FAILED);
		const allDone = statuses.every(s => s === SubmitStepStatus.DONE);
		const allFailed = statuses.every(s => s === SubmitStepStatus.FAILED);

		let finalStatus: ReleaseSubmitStatus;
		if (hasWaiting) {
			finalStatus = ReleaseSubmitStatus.WAITING_ACTION;
		} else if (allDone) {
			finalStatus = ReleaseSubmitStatus.DONE;
		} else if (allFailed) {
			finalStatus = ReleaseSubmitStatus.FAILED;
		} else {
			finalStatus = ReleaseSubmitStatus.PARTIAL_DONE;
		}

		await this.submitRepo.update(submitId, {
			status: finalStatus,
			completedAt: hasWaiting ? null : new Date(),
		});

		this.submitLog.log({
			releaseSubmitId: submitId,
			message: `Submit resolved: ${finalStatus}`,
			data: { branchStatuses: distBranches.map(s => ({ type: s.type, status: s.status })) },
		});
	}

	/**
	 * Chạy 1 step (parent). Nếu có childSteps → chạy tuần tự children.
	 * Return true nếu thành công, false nếu failed.
	 */
	private async runParentStep(step: ReleaseSubmitStep): Promise<boolean> {
		const now = new Date();

		// Update status → PROCESSING
		await this.stepRepo.update(step.id, {
			status: SubmitStepStatus.PROCESSING,
			startedAt: now,
		});

		try {
			const children = (step.childSteps || []).sort(
				(a, b) => a.order - b.order,
			);

			if (children.length > 0) {
				// Có children → chạy tuần tự children
				for (const child of children) {
					if (child.status === SubmitStepStatus.DONE) continue;
					if (child.status === SubmitStepStatus.SKIPPED) continue;

					const childSuccess = await this.runChildStep(child);
					if (!childSuccess) {
						// Child failed → parent failed, skip remaining children
						await this.stepRepo.update(step.id, {
							status: SubmitStepStatus.FAILED,
							completedAt: new Date(),
						});
						return false;
					}

					// Check WAITING_ACTION
					const refreshedChild = await this.stepRepo.findOne({
						where: { id: child.id },
					});
					
					if (
						refreshedChild?.status ===
						SubmitStepStatus.WAITING_ACTION
					) {
						await this.stepRepo.update(step.id, {
							status: SubmitStepStatus.WAITING_ACTION,
						});
						return true; // Parent chờ, không fail
					}
				}
			} else {
				// Không có children → chạy logic trực tiếp
				await this.dispatchStepLogic(step);
			}

			// Re-read từ DB: nếu children đã set WAITING_ACTION cho parent thì giữ nguyên
			const refreshedStep = await this.stepRepo.findOne({ where: { id: step.id } });
			if (refreshedStep?.status === SubmitStepStatus.WAITING_ACTION) {
				this.submitLog.warning({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `Step ${step.type} is WAITING_ACTION`,
				});
				return true;
			}

			// Done
			await this.stepRepo.update(step.id, {
				status: SubmitStepStatus.DONE,
				completedAt: new Date(),
			});
			this.submitLog.success({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Step ${step.type} completed`,
			});
			return true;
		} catch (err) {
			await this.stepRepo.update(step.id, {
				status: SubmitStepStatus.FAILED,
				completedAt: new Date(),
			});
			this.submitLog.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Step ${step.type} failed: ${err.message}`,
				data: { stack: err.stack },
			});
			return false;
		}
	}

	private async runChildStep(
		child: ReleaseSubmitStep,
	): Promise<boolean> {
		await this.stepRepo.update(child.id, {
			status: SubmitStepStatus.PROCESSING,
			startedAt: new Date(),
		});

		try {
			await this.dispatchStepLogic(child);

			// Re-read từ DB: nếu dispatch đã set WAITING_ACTION thì không ghi đè
			const refreshed = await this.stepRepo.findOne({ where: { id: child.id } });
			if (refreshed?.status === SubmitStepStatus.WAITING_ACTION) {
				this.submitLog.warning({
					releaseSubmitId: child.releaseSubmitId,
					releaseSubmitStepId: child.id,
					message: `Child step ${child.type} is WAITING_ACTION`,
				});
				return true;
			}

			await this.stepRepo.update(child.id, {
				status: SubmitStepStatus.DONE,
				completedAt: new Date(),
			});

			this.submitLog.success({
				releaseSubmitId: child.releaseSubmitId,
				releaseSubmitStepId: child.id,
				message: `Child step ${child.type} completed`,
			});
			return true;
		} catch (err) {
			await this.stepRepo.update(child.id, {
				status: SubmitStepStatus.FAILED,
				completedAt: new Date(),
			});
			this.submitLog.error({
				releaseSubmitId: child.releaseSubmitId,
				releaseSubmitStepId: child.id,
				message: `Child step ${child.type} failed: ${err.message}`,
				data: { stack: err.stack },
			});
			return false;
		}
	}

	// ==========================================
	// DISPATCH — Điều hướng logic theo step type
	// ==========================================

	/**
	 * Lấy context (releaseId, submit) từ step
	 */
	private async getStepContext(step: ReleaseSubmitStep) {
		const submit = await this.submitRepo.findOne({
			where: { id: step.releaseSubmitId },
		});
		if (!submit) throw new Error(`Submit ${step.releaseSubmitId} not found`);
		return {
			releaseId: submit.releaseId,
			submit,
		};
	}

	/**
	 * Lấy parent step (cho child steps cần đọc context từ parent)
	 */
	private async getParentStep(step: ReleaseSubmitStep) {
		if (!step.parentStepId) return null;
		return this.stepRepo.findOne({
			where: { id: step.parentStepId },
		});
	}

	/**
	 * Lấy sibling step theo type (cùng parent)
	 */
	private async getSiblingStepByType(
		step: ReleaseSubmitStep,
		type: SubmitStepType,
	) {
		return this.stepRepo.findOne({
			where: {
				parentStepId: step.parentStepId ?? IsNull(),
				releaseSubmitId: step.releaseSubmitId,
				type,
			},
		});
	}

	// main 
	private async dispatchStepLogic(step: ReleaseSubmitStep): Promise<void> {
		const { releaseId,  submit: submitDb } = await this.getStepContext(step);

		switch (step.type) {
			case SubmitStepType.GEN_UPC: {
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[GEN_UPC] Release: ${releaseId}` });
				const upc = await this.releaseService.genUpcById(releaseId);
				await this.stepRepo.update(step.id, {
					metadata: {
						input: { releaseId },
						output: { upc },
					} as any,
				});
				break;
			}

			case SubmitStepType.GEN_ISRCS:
				// Handled by children (GEN_ISRC per track)
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[GEN_ISRCS] handled by children` });
				break;

			case SubmitStepType.GEN_ISRC: {
				const trackId = step.metadata?.input?.trackId;
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[GEN_ISRC] Track: ${trackId}` });
				const isrc = await this.trackService.genISRC(trackId);
				await this.stepRepo.update(step.id, {
					metadata: {
						input: { trackId },
						output: { isrc },
					} as any,
				});
				break;
			}

			case SubmitStepType.VALIDATE: {
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[VALIDATE] Release: ${releaseId}` });
				const errors =
					this.releaseValidateService.getErrorsSchemaRelease(submitDb.metadata.input.releaseSnapshot);

				await this.stepRepo.update(step.id, {
					metadata: {
						input: {
							releaseId,
						},
						output: {
							valid: errors.length === 0,
							errors: errors
						},
					} as any,
				});

				if (errors.length > 0) {
					throw new Error(
						`Validation failed: ${errors.map((e: any) => e.message).join(', ')}`,
					);
				}
				break;
			}

			// ============================
			// Direct DSP sub-steps
			// ============================

			case SubmitStepType.CREATE_METADATA_DIRECT: {
				const parent = await this.getParentStep(step);
				const dspCode = parent?.metadata?.input?.dsps?.[0]?.code;
				if (!dspCode) throw new Error('Missing DSP code from parent step');

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

				const { outputDir, batchId } =
					await this.releaseDdexService.createMetadataOnServer({
						releaseId,
						ernVersion: config.ernVersion as unknown as ErnVersion2,
						sender: config.sender,
						recipient: config.recipient,
					});

				await this.stepRepo.update(step.id, {
					metadata: {
						input: { ernVersion: config.ernVersion, dspCode },
						output: { outputDir, batchId },
					} as any,
				});

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[CREATE_METADATA_DIRECT] DSP: ${dspCode}`, data: { outputDir, batchId } });
				break;
			}

			case SubmitStepType.UPLOAD_SFTP_DIRECT: {
				const metaStep = await this.getSiblingStepByType(
					step,
					SubmitStepType.CREATE_METADATA_DIRECT,
				);
				const meta = metaStep?.metadata;
				if (!meta?.output?.outputDir || !meta?.input?.dspCode) {
					throw new Error('Missing metadata from CREATE_METADATA_DIRECT');
				}

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						meta.input.dspCode,
					);

				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: meta.output.outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				// Cleanup local
				await removeFolder(meta.output.outputDir);

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[UPLOAD_SFTP_DIRECT] DSP: ${meta.input.dspCode} uploaded` });
				break;
			}

			case SubmitStepType.SYNC_DATA_FROM_DSP: {
				const parent = await this.getParentStep(step);
				const dsp = parent?.metadata?.input?.dsps?.[0];
				if (!dsp) throw new Error('Missing dsp from parent step');

				// Upsert release_dsp_delivery
				const existed = await this.manager.findOne(ReleaseDspDelivery, {
					where: { releaseId, dspId: dsp.id },
				});

				const deliveryData = {
					status: ReleaseDspStatus.DISTRIBUTED,
					lastDeliveredAt: new Date(),
					isSelected: true,
				};

				if (!existed) {
					await this.manager.save(ReleaseDspDelivery, {
						releaseId,
						dspId: dsp.id,
						...deliveryData,
					});
				} else {
					await this.manager.update(
						ReleaseDspDelivery,
						{ releaseId, dspId: dsp.id },
						deliveryData,
					);
				}

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[SYNC_DATA_FROM_DSP] DSP: ${dsp.name} synced` });
				break;
			}

			// ============================
			// CI Aggregator sub-steps
			// ============================

			case SubmitStepType.CREATE_METADATA_CI: {
				// Tìm 1 DSP CI bất kỳ để lấy config
				const parent = await this.getParentStep(step);
				const ciDsps = parent?.metadata?.input?.dsps || [];
				if (ciDsps.length === 0) throw new Error('No CI DSPs found');

				const ciDsp = await this.manager.findOne(Dsp, {
					where: { id: ciDsps[0].id },
					relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
				});
				if (!ciDsp?.code) throw new Error('CI DSP not found');

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						ciDsp.code,
					);

				const { outputDir, batchId } =
					await this.releaseDdexService.createMetadataOnServer({
						releaseId,
						ernVersion: config.ernVersion as unknown as ErnVersion2,
						sender: config.sender,
						recipient: config.recipient,
					});

				await this.stepRepo.update(step.id, {
					metadata: {
						input: { ernVersion: config.ernVersion, dspCode: ciDsp.code },
						output: { outputDir, batchId },
					} as any,
				});

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[CREATE_METADATA_CI] done`, data: { outputDir, batchId } });
				break;
			}

			case SubmitStepType.UPLOAD_SFTP_CI: {
				const metaStep = await this.getSiblingStepByType(
					step,
					SubmitStepType.CREATE_METADATA_CI,
				);
				const meta = metaStep?.metadata;
				if (!meta?.output?.outputDir || !meta?.input?.dspCode) {
					throw new Error('Missing metadata from CREATE_METADATA_CI');
				}

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(
						meta.input.dspCode,
					);

				await this.sftpConnectService.uploadFolder({
					sftp: config.sftp,
					localDir: meta.output.outputDir,
					remoteDir: config.sftp.path ?? '/',
				});

				await removeFolder(meta.output.outputDir);

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[UPLOAD_SFTP_CI] uploaded` });
				break;
			}

			case SubmitStepType.CREATE_FOLDER_DONE_CI: {
				// Lấy batchId từ sibling CREATE_METADATA_CI
				const metaStep = await this.getSiblingStepByType(
					step,
					SubmitStepType.CREATE_METADATA_CI,
				);
				const batchId = metaStep?.metadata?.output?.batchId;
				if (!batchId) {
					throw new Error('Missing batchId from CREATE_METADATA_CI step');
				}

				// Lấy dspCode CI từ sibling CREATE_METADATA_CI
				const dspCode = metaStep?.metadata?.input?.dspCode;
				if (!dspCode) {
					throw new Error('Missing dspCode from CREATE_METADATA_CI step');
				}

				const config =
					await this.dspRoutingService.resolveFullDeliveryConfig(dspCode);

				const client = await this.sftpConnectService.connect(config.sftp);
				try {
					const donePath = path.posix.join(
						config.sftp.path ?? '/',
						`${batchId}.done`,
					);
					await client.mkdir(donePath, true);
					this.submitLog.success({
						releaseSubmitId: step.releaseSubmitId,
						releaseSubmitStepId: step.id,
						message: `[CREATE_FOLDER_DONE_CI] Created: ${donePath}`,
						data: { batchId, donePath },
					});
				} finally {
					await client.end();
				}
				break;
			}

			case SubmitStepType.WAIT_PARTNER_PROCESS: {
				const WAIT_MINUTES = 1;
				const scheduledAt = new Date(Date.now() + WAIT_MINUTES * 60 * 1000);

				await this.stepRepo.update(step.id, {
					status: SubmitStepStatus.WAITING_ACTION,
					scheduledAt,
				});

				this.submitLog.log({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[WAIT_PARTNER_PROCESS_CI] Scheduled resume at ${scheduledAt.toISOString()} (+${WAIT_MINUTES}min)`,
				});
				break;
			}

			case SubmitStepType.GET_QA_FLAG_CI: {
				// break;
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[GET_QA_FLAG_CI] Release: ${releaseId}` });
				const qaFlags = await this.releaseService.getQaFlagCi(releaseId);

				await this.stepRepo.update(step.id, {
					metadata: {
						input: { releaseId },
						output: { qaFlags },
					} as any,
				});
				break;
			}

			case SubmitStepType.SEND_EMAIL_TO_STATE: {
				this.submitLog.log({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[SEND_EMAIL_TO_STATE] Release: ${releaseId}` });

				// Lấy danh sách CI DSP codes từ parent
				const parent = await this.getParentStep(step);
				const ciDsps = parent?.metadata?.input?.dsps || [];
				const ciDspCodes = ciDsps
					.map((d: Dsp) => d.codeCi)
					.filter((code: any): code is string => code !== null);
				if (ciDspCodes.length === 0) {
					throw new Error('Missing CI DSP codes from parent step');
				}

				// Lấy aggregator info để lấy deliveryEmail
				const ciDsp = await this.manager.findOne(Dsp, {
					where: { id: ciDsps[0].id },
					relations: ['dspRoutingConfig', 'dspRoutingConfig.aggregator'],
				});
				const aggregator = ciDsp?.dspRoutingConfig?.aggregator;
				if (!aggregator?.deliveryEmail) {
					throw new Error(`[SEND_EMAIL_TO_STATE] Missing deliveryEmail on aggregator`);
				}

				// Export Excel từ snapshot
				const upc = submitDb.metadata?.input?.releaseSnapshot?.upc;
				const buffer = await this.fileExportCiService.createFileExportCi({
					data: [{ listCodeDspCi: ciDspCodes, upc }],
				});

				const baseDir = process.env.RELEASE_PARSED_DIR || path.resolve('release_parsed');
				const tempDir = path.join(baseDir, 'temp_exports', releaseId);
				if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

				const fileName = `Release_${releaseId}_CI.xlsx`;
				const filePath = path.join(tempDir, fileName);
				fs.writeFileSync(filePath, buffer);

				// Gửi email
				const subject = aggregator.deliveryEmailSubject || `[Distribution] Release: ${releaseId}`;
				const html = ` `;

				await this.notificationResendService.sendEmail({
					to: [aggregator.deliveryEmail],
					subject,
					html,
					attachments: [{ filename: fileName, path: filePath }],
				});

				// Cleanup
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
					const files = fs.readdirSync(tempDir);
					if (files.length === 0) fs.rmdirSync(tempDir);
				}

				this.submitLog.success({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[SEND_EMAIL_TO_STATE] Email sent to ${aggregator.deliveryEmail}`,
					data: { fileName, to: aggregator.deliveryEmail },
				});
				break;
			}

			case SubmitStepType.WAITING_ADMIN_EXPORT: {
				this.submitLog.warning({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[WAITING_ADMIN_EXPORT] Waiting for admin action` });
				// Chuyển sang WAITING_ACTION, dừng execution tại đây
				await this.stepRepo.update(step.id, {
					status: SubmitStepStatus.WAITING_ACTION,
				});
				break;
			}

			case SubmitStepType.SYNC_DATA_DSP_CI: {
				// Lấy tất cả CI DSP IDs từ parent
				const parent = await this.getParentStep(step);
				const ciDsps = parent?.metadata?.input?.dsps || [];

				for (const dspInfo of ciDsps) {
					const existed = await this.manager.findOne(ReleaseDspDelivery, {
						where: { releaseId, dspId: dspInfo.id },
					});

					const deliveryData = {
						status: ReleaseDspStatus.DISTRIBUTED,
						lastDeliveredAt: new Date(),
						isSelected: true,
					};

					if (!existed) {
						await this.manager.save(ReleaseDspDelivery, {
							releaseId,
							dspId: dspInfo.id,
							...deliveryData,
						});
					} else {
						await this.manager.update(
							ReleaseDspDelivery,
							{ releaseId, dspId: dspInfo.id },
							deliveryData,
						);
					}
				}

				this.submitLog.success({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `[SYNC_DATA_DSP_CI] ${ciDsps.length} DSPs synced` });
				break;
			}

			default:
				this.submitLog.warning({ releaseSubmitId: step.releaseSubmitId, releaseSubmitStepId: step.id, message: `Unknown step type: ${step.type}` });
		}
	}

	// ==========================================
	// RETRY — Retry từ step failed trở đi
	// ==========================================

	async retryStep(stepId: string) {
		const step = await this.stepRepo.findOne({
			where: { id: stepId },
		});
		if (!step) throw new NotFoundException('Step not found');

		// Reset step về NEW
		await this.stepRepo.update(stepId, {
			status: SubmitStepStatus.NEW,
			startedAt: null,
			completedAt: null,
			retryCount: step.retryCount + 1,
		});

		// Reset parent submit về PROCESSING
		await this.submitRepo.update(step.releaseSubmitId, {
			status: ReleaseSubmitStatus.PROCESSING,
			completedAt: null,
			summary: null,
		});

		// Reset các step sau (nếu bị SKIPPED) về NEW
		const siblingSteps = await this.stepRepo.find({
			where: {
				releaseSubmitId: step.releaseSubmitId,
				parentStepId: step.parentStepId ?? IsNull(),
			},
			order: { order: 'ASC' },
		});

		for (const s of siblingSteps) {
			if (s.order > step.order && s.status === SubmitStepStatus.SKIPPED) {
				await this.stepRepo.update(s.id, {
					status: SubmitStepStatus.NEW,
				});
			}
		}

		// Re-execute
		this.runPipeline(step.releaseSubmitId).catch((err) => {
			this.submitLog.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Retry re-execute failed: ${err.message}`,
			});
		});

		return { message: 'Retry started' };
	}

	// ==========================================
	// RESUME — Admin hoàn thành WAITING_ACTION
	// ==========================================

	async resumeFromWaiting(stepId: string) {
		const step = await this.stepRepo.findOne({ where: { id: stepId } });
		if (!step) throw new NotFoundException('Step not found');
		if (step.status !== SubmitStepStatus.WAITING_ACTION) {
			throw new Error('Step is not in WAITING_ACTION status');
		}

		// Mark step as DONE
		await this.stepRepo.update(stepId, {
			status: SubmitStepStatus.DONE,
			completedAt: new Date(),
		});

		// Resume execution
		await this.submitRepo.update(step.releaseSubmitId, {
			status: ReleaseSubmitStatus.PROCESSING,
		});

		this.runPipeline(step.releaseSubmitId).catch((err) => {
			this.submitLog.error({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `Resume re-execute failed: ${err.message}`,
			});
		});

		return { message: 'Resumed' };
	}

	

	private async skipRemainingSteps(submitId: string, afterOrder: number) {
		await this.stepRepo
			.createQueryBuilder()
			.update()
			.set({ status: SubmitStepStatus.SKIPPED })
			.where('release_submit_id = :submitId', { submitId })
			.andWhere('parent_step_id IS NULL')
			.andWhere('order > :afterOrder', { afterOrder })
			.andWhere('status = :status', { status: SubmitStepStatus.NEW })
			.execute();
	}

	// query
	// ==========================================
	// LIST
	// ==========================================

	async getList(query: QueryGetListSubmitDto) {
		const { page, pageSize, status, releaseId } = query;

		const qb = this.submitRepo
			.createQueryBuilder('submit')
			// .leftJoinAndSelect('submit.steps', 'steps', 'steps.parent_step_id IS NULL');

		// Filter status
		if (status?.length) {
			qb.andWhere('submit.status IN (:...status)', { status });
		}

		// Filter releaseId
		if (releaseId) {
			qb.andWhere('submit.releaseId = :releaseId', { releaseId });
		}

		// Order + Pagination
		orderAndPaging2({ qb, filter: query });

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async findOne(id: string) {
		const entity = await this.submitRepo.findOne({
			where: { id },
			relations: {
				steps: {
					childSteps: {
						logs: true
					},
					logs: true,
				},
				logs: true
			},
		});
		if (!entity) {
			throw new NotFoundException('Release submit not found');
		}
		return entity;
	}

	// ==========================================
	// CRON — Auto-resume scheduled steps
	// ==========================================

	@Cron(CronExpression.EVERY_MINUTE)
	async handleScheduledSteps() {
		const now = new Date();

		const readySteps = await this.stepRepo.find({
			where: {
				status: SubmitStepStatus.WAITING_ACTION,
				scheduledAt: LessThanOrEqual(now),
			},
		});

		for (const step of readySteps) {
			this.submitLog.log({
				releaseSubmitId: step.releaseSubmitId,
				releaseSubmitStepId: step.id,
				message: `[CRON] Auto-resuming scheduled step ${step.type}`,
			});

			this.resumeFromWaiting(step.id).catch((err) => {
				this.submitLog.error({
					releaseSubmitId: step.releaseSubmitId,
					releaseSubmitStepId: step.id,
					message: `[CRON] Auto-resume failed: ${err.message}`,
				});
			});
		}
	}
}
