// import { Injectable } from '@nestjs/common';
// import { ReleaseExecutionStep3 } from '../entites/release-execution3.entity';
// import { ReleaseExecutionStepType } from '../enums/release-execution3.enum';

// @Injectable()
// export class ReleaseExecution3Engine {
// 	private async dispatchStepLogic(
// 		step: ReleaseExecutionStep3,
// 	): Promise<void> {
// 		switch (step.type) {
// 			case ReleaseExecutionStepType.GEN_UPC: {
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[GEN_UPC] Release: ${releaseId}`,
// 				});
// 				const upc = await this.releaseService.genUpcById(releaseId);
// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: { releaseId },
// 						output: { upc },
// 					} as any,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.GEN_ISRCS: {
// 				// Handled by children (GEN_ISRC per track)
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[GEN_ISRCS] handled by children`,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.GEN_ISRC: {
// 				const trackId = step.metadata?.input?.trackId;
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[GEN_ISRC] Track: ${trackId}`,
// 				});
// 				const isrc = await this.trackService.genISRC(trackId);
// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: { trackId },
// 						output: { isrc },
// 					} as any,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.VALIDATE: {
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[VALIDATE] Release: ${releaseId}`,
// 				});
// 				const errors =
// 					this.releaseValidateService.getErrorsSchemaRelease(
// 						submitDb.metadata.input.releaseSnapshot,
// 					);

// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: {
// 							releaseId,
// 						},
// 						output: {
// 							valid: errors.length === 0,
// 							errors: errors,
// 						},
// 					} as any,
// 				});

// 				if (errors.length > 0) {
// 					throw new Error(
// 						`Validation failed: ${errors.map((e: any) => e.message).join(', ')}`,
// 					);
// 				}
// 				break;
// 			}

// 			// ============================
// 			// Direct DSP sub-steps
// 			// ============================

// 			case SubmitStepType.CREATE_AND_UPLOAD_DIRECT: {
// 				const parent = await this.getParentStep(step);
// 				const dspCode = parent?.metadata?.input?.dsps?.[0]?.code;
// 				if (!dspCode)
// 					throw new Error('Missing DSP code from parent step');

// 				const config =
// 					await this.dspRoutingService.resolveFullDeliveryConfig(
// 						dspCode,
// 					);

// 				// Create metadata
// 				const { outputDir, batchId, xml } =
// 					await this.releaseDdexService.createMetadataOnServer({
// 						release: submitDb.metadata.input.releaseSnapshot,
// 						ernVersion: config.ernVersion as unknown as ErnVersion2,
// 						sender: config.sender,
// 						recipient: config.recipient,
// 					});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[CREATE_AND_UPLOAD_DIRECT] Metadata created for DSP: ${dspCode}`,
// 					data: { outputDir, batchId },
// 				});

// 				// Upload SFTP
// 				await this.sftpConnectService.uploadFolder({
// 					sftp: config.sftp,
// 					localDir: outputDir,
// 					remoteDir: config.sftp.path ?? '/',
// 				});

// 				// Cleanup local
// 				await removeFolder(outputDir);

// 				// Save metadata for downstream steps
// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: { ernVersion: config.ernVersion, dspCode },
// 						output: { outputDir, batchId, xml },
// 					} as any,
// 				});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[CREATE_AND_UPLOAD_DIRECT] DSP: ${dspCode} uploaded`,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.SYNC_DATA_FROM_DSP: {
// 				const parent = await this.getParentStep(step);
// 				const dsp = parent?.metadata?.input?.dsps?.[0];
// 				if (!dsp) throw new Error('Missing dsp from parent step');

// 				// Upsert release_dsp_delivery
// 				const existed = await this.manager.findOne(ReleaseDspDelivery, {
// 					where: { releaseId, dspId: dsp.id },
// 				});

// 				const deliveryData = {
// 					status: ReleaseDspStatus.DISTRIBUTED,
// 					lastDeliveredAt: new Date(),
// 					isSelected: true,
// 				};

// 				if (!existed) {
// 					await this.manager.save(ReleaseDspDelivery, {
// 						releaseId,
// 						dspId: dsp.id,
// 						...deliveryData,
// 					});
// 				} else {
// 					await this.manager.update(
// 						ReleaseDspDelivery,
// 						{ releaseId, dspId: dsp.id },
// 						deliveryData,
// 					);
// 				}

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[SYNC_DATA_FROM_DSP] DSP: ${dsp.name} synced`,
// 				});
// 				break;
// 			}

// 			// ============================
// 			// CI Aggregator sub-steps
// 			// ============================

// 			// case SubmitStepType.CREATE_AND_UPLOAD_CI: {
// 			// 	// Tìm 1 DSP CI bất kỳ để lấy config
// 			// 	const parent = await this.getParentStep(step);
// 			// 	const ciDsps = parent?.metadata?.input?.dsps || [];
// 			// 	if (ciDsps.length === 0) throw new Error('No CI DSPs found');

// 			// 	const ciDsp = await this.manager.findOne(Dsp, {
// 			// 		where: { id: ciDsps[0].id },
// 			// 		relations: [
// 			// 			'dspRoutingConfig',
// 			// 			'dspRoutingConfig.aggregator',
// 			// 		],
// 			// 	});
// 			// 	if (!ciDsp?.code) throw new Error('CI DSP not found');

// 			// 	const config =
// 			// 		await this.dspRoutingService.resolveFullDeliveryConfig(
// 			// 			ciDsp.code,
// 			// 		);

// 			// 	// Create metadata
// 			// 	const { outputDir, batchId, xml } =
// 			// 		await this.releaseDdexService.createMetadataOnServer({
// 			// 			release: submitDb.metadata.input.releaseSnapshot,
// 			// 			ernVersion: config.ernVersion as unknown as ErnVersion2,
// 			// 			sender: config.sender,
// 			// 			recipient: config.recipient,
// 			// 		});

// 			// 	this.logService.success({
// 			// 		releaseSubmitId: step.releaseSubmitId,
// 			// 		releaseSubmitStepId: step.id,
// 			// 		message: `[CREATE_AND_UPLOAD_CI] Metadata created`,
// 			// 		data: { outputDir, batchId },
// 			// 	});

// 			// 	// Upload SFTP
// 			// 	await this.sftpConnectService.uploadFolder({
// 			// 		sftp: config.sftp,
// 			// 		localDir: outputDir,
// 			// 		remoteDir: config.sftp.path ?? '/',
// 			// 	});

// 			// 	await removeFolder(outputDir);

// 			// 	// Save metadata for downstream steps (CREATE_FOLDER_DONE_CI, etc.)
// 			// 	await this.stepRepo.update(step.id, {
// 			// 		metadata: {
// 			// 			input: {
// 			// 				ernVersion: config.ernVersion,
// 			// 				dspCode: ciDsp.code,
// 			// 			},
// 			// 			output: { outputDir, batchId, xml },
// 			// 		} as any,
// 			// 	});

// 			// 	this.logService.success({
// 			// 		releaseSubmitId: step.releaseSubmitId,
// 			// 		releaseSubmitStepId: step.id,
// 			// 		message: `[CREATE_AND_UPLOAD_CI] uploaded`,
// 			// 	});
// 			// 	break;
// 			// }

// 			case SubmitStepType.CREATE_AND_UPLOAD_CI: {
// 				// Tìm DSP CI có config hợp lệ
// 				const parent = await this.getParentStep(step);
// 				const ciDsps = parent?.metadata?.input?.dsps || [];
// 				if (ciDsps.length === 0) throw new Error('No CI DSPs found');

// 				let ciDsp: Dsp | null = null;
// 				let config: Awaited<
// 					ReturnType<
// 						typeof this.dspRoutingService.resolveFullDeliveryConfig
// 					>
// 				> | null = null;

// 				for (const dspRef of ciDsps) {
// 					const candidate = await this.manager.findOne(Dsp, {
// 						where: { id: dspRef.id },
// 						relations: [
// 							'dspRoutingConfig',
// 							'dspRoutingConfig.aggregator',
// 						],
// 					});
// 					if (!candidate?.code) continue;

// 					try {
// 						const candidateConfig =
// 							await this.dspRoutingService.resolveFullDeliveryConfig(
// 								candidate.code,
// 							);
// 						if (candidateConfig) {
// 							ciDsp = candidate;
// 							config = candidateConfig;
// 							break;
// 						}
// 					} catch {
// 						// DSP này không có config, thử DSP tiếp theo
// 						continue;
// 					}
// 				}

// 				if (!ciDsp || !config)
// 					throw new Error('No CI DSP with valid config found');

// 				// Create metadata
// 				const { outputDir, batchId, xml } =
// 					await this.releaseDdexService.createMetadataOnServer({
// 						release: submitDb.metadata.input.releaseSnapshot,
// 						ernVersion: config.ernVersion as unknown as ErnVersion2,
// 						sender: config.sender,
// 						recipient: config.recipient,
// 					});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[CREATE_AND_UPLOAD_CI] Metadata created`,
// 					data: { outputDir, batchId },
// 				});

// 				// Upload SFTP
// 				await this.sftpConnectService.uploadFolder({
// 					sftp: config.sftp,
// 					localDir: outputDir,
// 					remoteDir: config.sftp.path ?? '/',
// 				});

// 				await removeFolder(outputDir);

// 				// Save metadata for downstream steps (CREATE_FOLDER_DONE_CI, etc.)
// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: {
// 							ernVersion: config.ernVersion,
// 							dspCode: ciDsp.code,
// 						},
// 						output: { outputDir, batchId, xml },
// 					} as any,
// 				});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[CREATE_AND_UPLOAD_CI] uploaded`,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.CREATE_FOLDER_DONE_CI: {
// 				// Lấy batchId từ sibling CREATE_AND_UPLOAD_CI
// 				const metaStep = await this.getSiblingStepByType(
// 					step,
// 					SubmitStepType.CREATE_AND_UPLOAD_CI,
// 				);
// 				const batchId = metaStep?.metadata?.output?.batchId;
// 				if (!batchId) {
// 					throw new Error(
// 						'Missing batchId from CREATE_AND_UPLOAD_CI step',
// 					);
// 				}

// 				// Lấy dspCode CI từ sibling CREATE_AND_UPLOAD_CI
// 				const dspCode = metaStep?.metadata?.input?.dspCode;
// 				if (!dspCode) {
// 					throw new Error(
// 						'Missing dspCode from CREATE_AND_UPLOAD_CI step',
// 					);
// 				}

// 				const config =
// 					await this.dspRoutingService.resolveFullDeliveryConfig(
// 						dspCode,
// 					);

// 				const client = await this.sftpConnectService.connect(
// 					config.sftp,
// 				);
// 				try {
// 					const donePath = path.posix.join(
// 						config.sftp.path ?? '/',
// 						`${batchId}.done`,
// 					);
// 					await client.mkdir(donePath, true);
// 					this.logService.success({
// 						releaseSubmitId: step.releaseSubmitId,
// 						releaseSubmitStepId: step.id,
// 						message: `[CREATE_FOLDER_DONE_CI] Created: ${donePath}`,
// 						data: { batchId, donePath },
// 					});
// 				} finally {
// 					await client.end();
// 				}
// 				break;
// 			}

// 			case SubmitStepType.WAIT_PARTNER_PROCESS: {
// 				const waitMinutes = step.metadata?.input?.waitMinutes ?? 3;
// 				const scheduledAt = new Date(
// 					Date.now() + waitMinutes * 60 * 1000,
// 				);

// 				await this.stepRepo.update(step.id, {
// 					status: SubmitStepStatus.WAITING_ACTION,
// 					scheduledAt,
// 				});

// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[WAIT_PARTNER_PROCESS] Scheduled resume at ${scheduledAt.toISOString()} (+${waitMinutes}min)`,
// 				});
// 				break;
// 			}

// 			case SubmitStepType.VALIDATE_QA_CI: {
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[VALIDATE_QA_CI] Release: ${releaseId}`,
// 				});
// 				const qaFlags =
// 					await this.releaseService.getQaFlagCi(releaseId);
// 				const hasIssues = Array.isArray(qaFlags) && qaFlags.length > 0;

// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						input: { releaseId },
// 						output: { qaFlags, hasIssues },
// 					} as any,
// 				});

// 				if (hasIssues) {
// 					throw new Error(
// 						`QA validation failed: ${qaFlags.length} issue(s) found`,
// 					);
// 				}
// 				break;
// 			}

// 			case SubmitStepType.EXPORT_CI: {
// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[EXPORT_CI] Release: ${releaseId}`,
// 				});

// 				const exportInput = step.metadata?.input || {};
// 				const upc = submitDb.metadata?.input?.releaseSnapshot?.upc;

// 				// Tạo job email_state51 (nếu có state51 DSPs)
// 				const state51DspCodes: string[] =
// 					exportInput.state51DspCodes || [];
// 				const state51DspsData: any[] = exportInput.state51Dsps || [];
// 				if (state51DspCodes.length > 0) {
// 					// Lấy deliveryEmail từ aggregator
// 					const ciDsp =
// 						state51DspsData.length > 0
// 							? await this.manager.findOne(Dsp, {
// 									where: { id: state51DspsData[0].id },
// 									relations: [
// 										'dspRoutingConfig',
// 										'dspRoutingConfig.aggregator',
// 									],
// 								})
// 							: null;
// 					const deliveryEmail =
// 						ciDsp?.dspRoutingConfig?.aggregator?.deliveryEmail;
// 					const deliveryEmailSubject =
// 						ciDsp?.dspRoutingConfig?.aggregator
// 							?.deliveryEmailSubject;

// 					if (!deliveryEmail) {
// 						throw new Error(
// 							'[EXPORT_CI] Missing deliveryEmail on aggregator for state51 DSPs',
// 						);
// 					}

// 					await this.ciJobService.createJob({
// 						type: CiJobType.EMAIL_STATE51,
// 						upc,
// 						dspCiCodes: state51DspCodes,
// 						releaseSubmitId: step.releaseSubmitId,
// 						stepId: step.id,
// 						releaseId,
// 						deliveryEmail,
// 						deliveryEmailSubject,
// 						stepLabel: 'Export CI - Email State51',
// 					});
// 				}

// 				// Tạo job admin_export (nếu có deal DSPs)
// 				const ciDealDspCodes: string[] =
// 					exportInput.ciDealDspCodes || [];
// 				if (ciDealDspCodes.length > 0) {
// 					await this.ciJobService.createJob({
// 						type: CiJobType.ADMIN_EXPORT,
// 						upc,
// 						dspCiCodes: ciDealDspCodes,
// 						releaseSubmitId: step.releaseSubmitId,
// 						stepId: step.id,
// 						releaseId,
// 						stepLabel: 'Export CI - Admin Export',
// 					});
// 				}

// 				// WAITING_ACTION — chờ tất cả CI jobs xong mới resume
// 				await this.stepRepo.update(step.id, {
// 					status: SubmitStepStatus.WAITING_ACTION,
// 				});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[EXPORT_CI] ${state51DspCodes.length > 0 ? 'email_state51' : ''} ${ciDealDspCodes.length > 0 ? 'admin_export' : ''} jobs created, step paused`,
// 					data: { upc, state51DspCodes, ciDealDspCodes },
// 				});
// 				break;
// 			}

// 			case SubmitStepType.SYNC_DATA_DSP_CI: {
// 				const upc = submitDb.metadata?.input?.releaseSnapshot?.upc;
// 				if (!upc) throw new Error('Missing UPC from release snapshot');

// 				this.logService.log({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[SYNC_DATA_DSP_CI] Fetching DSP statuses from CI for UPC: ${upc}`,
// 				});

// 				const dspStatuses = await this.ciService.getStatusDsps(upc);

// 				// Map CI code → system code
// 				const ciCodes = dspStatuses
// 					.map((d) => d.ciCode)
// 					.filter(Boolean);
// 				const dsps =
// 					ciCodes.length > 0
// 						? await this.manager.find(Dsp, {
// 								where: { codeCi: In(ciCodes) },
// 							})
// 						: [];
// 				const ciToSystem = new Map(
// 					dsps.map((d) => [d.codeCi, { code: d.code, name: d.name }]),
// 				);

// 				const mappedStatuses = dspStatuses.map((d) => ({
// 					ciCode: d.ciCode,
// 					code: ciToSystem.get(d.ciCode)?.code || null,
// 					name: ciToSystem.get(d.ciCode)?.name || null,
// 					status: d.status,
// 				}));

// 				// Lưu kết quả vào metadata.output
// 				await this.stepRepo.update(step.id, {
// 					metadata: {
// 						...step.metadata,
// 						output: {
// 							...step.metadata?.output,
// 							result: mappedStatuses,
// 						},
// 					} as any,
// 				});

// 				this.logService.success({
// 					releaseSubmitId: step.releaseSubmitId,
// 					releaseSubmitStepId: step.id,
// 					message: `[SYNC_DATA_DSP_CI] ${mappedStatuses.length} DSPs synced`,
// 					data: { dspStatuses: mappedStatuses },
// 				});
// 				break;
// 			}

// 			default:
// 				throw new Error(`Unknown step type1: ${step.type}`);
// 		}
// 	}
// }
