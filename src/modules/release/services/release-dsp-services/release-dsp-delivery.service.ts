// services/release-dsp-delivery.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { removeFolder } from 'src/utils/util';
import { EntityManager, In, Repository } from 'typeorm';
import { ReleaseDspDeliveryException } from '../../constants/release-dsp.constant';
import {
	CreateReleaseDspDeliveryDto,
	GetListReleaseDspDeliveriesDto,
	UpdateReleaseDspDeliveryDto,
} from '../../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../../entities/release-dsp-delivery.entity';
import { Release } from '../../entities/release.entity';
import { ReleaseDspStatus } from '../../enum/release-dsp.enum';
import { ReleaseLogService } from '../../modules/release-log/services/release-log.service';
import { ReleaseDdexService } from '../release-ddex.service';
import { ReleaseDspDeliveryQueryService } from './release-dsp-delivery-query.service';

@Injectable()
export class ReleaseDspDeliveryService {
	private readonly logger = new Logger(ReleaseDspDeliveryService.name);

	constructor(
		@InjectRepository(ReleaseDspDelivery)
		private readonly repo: Repository<ReleaseDspDelivery>,
		private readonly queryService: ReleaseDspDeliveryQueryService,

		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly sftpConnectService: SftpConnectService,
		private readonly releaseDdexService: ReleaseDdexService,
		private readonly releaseLogService: ReleaseLogService,
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	// ==================== Public Distribution API ====================
	async executeDistribution(
		releaseId: string,
		codes: string[],
	): Promise<string[]> {
		const results = await Promise.allSettled(
			codes.map((code) => this.processDsp(releaseId, code)),
		);

		return results
			.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
			.map(
				(r, i) =>
					`${codes[results.indexOf(r)]}: ${r.reason?.message ?? 'Unknown error'}`,
			);
	}

	private async processDsp(releaseId: string, code: string): Promise<void> {
		let dsp: Dsp | null = null;
		let releaseDspDeliveryId: string | null = null;

		try {
			dsp = await this.dspRepo.findOne({ where: { code } });
			if (!dsp) {
				throw new ResponseError({
					message: `Hệ thống chưa hỗ trợ hoặc thiếu cấu hình DSP ${code}`,
				});
			}

			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			releaseDspDeliveryId = await this.findReleaseDspDeliveryId(
				releaseId,
				dsp.id,
			);

			if (releaseDspDeliveryId) {
				const delivery = await this.findOne(releaseDspDeliveryId);
				if (
					delivery.status !== ReleaseDspStatus.DRAFT &&
					delivery.status !== ReleaseDspStatus.ISSUES &&
					delivery.status !== ReleaseDspStatus.NEVER_DISTRIBUTED
				) {
					this.logger.warn(
						`Bỏ qua DSP ${dsp.name} do trạng thái hiện tại (${delivery.status}) không hợp lệ để gửi lại.`,
					);
					this.releaseLogService.pending({
						releaseId,
						step: `Kiểm tra gửi DSP ${dsp.name}`,
						message: `Bỏ qua DSP ${dsp.name} do trạng thái hiện tại (${delivery.status}) không hợp lệ để gửi lại.`,
						codeDsp: code,
						dspId: dsp.id,
						deliveryId: releaseDspDeliveryId,
					});
					return;
				}
			}

			// 1. Resolve config from DB
			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(code);

			// 2. Mark as processing
			await this.upsertProcessing(releaseId, dsp.id);
			releaseDspDeliveryId = await this.findReleaseDspDeliveryId(
				releaseId,
				dsp.id,
			);

			const isCI = config.isCI;

			if (isCI && release?.isSentMetadataCi) {
				await this.markDistributed(releaseId, dsp.id);

				this.releaseLogService.success({
					releaseId,
					step: `Ghi nhận DSP ${dsp.name}`,
					message: `Tạo dữ liệu và đóng gói gửi DSP ${dsp.name} thành công (Đã gộp gửi chung CI)`,
					codeDsp: code,
					dspId: dsp.id,
					deliveryId: releaseDspDeliveryId,
				});
				return;
			}

			// 3. Create metadata on server (stateless — returns path, no DB write)
			const { outputDir, batchId } =
				await this.releaseDdexService.createMetadataOnServer({
					releaseId,
					ernVersion: config.ernVersion as unknown as ErnVersion2,
					sender: config.sender,
					recipient: config.recipient,
				});

			// 4. Save metadata path to delivery record
			await this.updateMetadataInfo(releaseId, dsp.id, {
				metadataPath: outputDir,
				batchId,
			});

			// 5. Upload to SFTP (Retry 3 times)
			let uploadSuccess = false;
			let lastUploadErr: any = null;
			for (let i = 1; i <= 3; i++) {
				try {
					await this.sftpConnectService.uploadFolder({
						sftp: config.sftp,
						localDir: outputDir,
						remoteDir: config.sftp.path ?? '/',
					});
					uploadSuccess = true;
					break;
				} catch (err: any) {
					lastUploadErr = err;
					this.logger.warn(
						`[SFTP_UPLOAD] Upload metadata DSP ${code} thất bại lần ${i}/3: ${err.message}`,
					);
					if (i < 3) {
						await new Promise((res) => setTimeout(res, 3000)); // Đợi 3s trước khi thử lại
					}
				}
			}

			if (!uploadSuccess) {
				throw new Error(
					`Upload SFTP thất bại sau 3 lần thử: ${lastUploadErr?.message}`,
				);
			}

			// 6. Post-upload hooks (e.g. CI aggregator .done folder)
			if (config.createsDoneFolder) {
				const batchFolder = path.basename(outputDir);
				await this.createDoneFolderOnSftp(config.sftp, batchFolder);
			}

			// 7. Cleanup local files
			await removeFolder(outputDir);

			// 8. Update CI flag
			if (isCI && !release?.isSentMetadataCi) {
				await this.releaseRepo.update(releaseId, {
					isSentMetadataCi: true,
				});
			}

			// 9. Mark success
			await this.markDistributed(releaseId, dsp.id);

			this.releaseLogService.success({
				releaseId,
				step: `Ghi nhận DSP ${dsp.name}`,
				message: `Tạo dữ liệu và đóng gói gửi DSP ${dsp.name} thành công`,
				codeDsp: code,
				dspId: dsp.id,
				deliveryId: releaseDspDeliveryId,
			});
		} catch (error: any) {
			const isInvalidStatusError =
				error instanceof ResponseError &&
				(error.getResponse() as any)?.messageCode ===
					'release.message.error.cannotSubmitInvalidStatus';

			if (dsp && !isInvalidStatusError) {
				await this.markIssues(releaseId, dsp.id);
			}

			const dspName = dsp?.name ?? code;

			this.releaseLogService.failed({
				releaseId,
				step: `Ghi nhận DSP ${dspName}`,
				message: isInvalidStatusError
					? (error.getResponse() as any)?.message
					: `Quá trình xử lý DSP ${dspName} thất bại: ${error?.message ?? 'Lỗi không xác định'}`,
				codeDsp: code,
				dspId: dsp?.id,
				deliveryId: releaseDspDeliveryId,
			});

			throw error;
		}
	}

	private async createDoneFolderOnSftp(sftp: any, batchId: string) {
		const client = await this.sftpConnectService.connect(sftp);
		try {
			const donePath = path.posix.join(
				sftp.path ?? '/',
				`${batchId}.done`,
			);
			await client.mkdir(donePath, true);
			this.logger.log(`[DONE_FOLDER_CREATED] ${donePath}`);
		} catch (err: any) {
			this.logger.error(`Failed to create .done folder: ${err.message}`);
		} finally {
			await client.end();
		}
	}

	// ==================== Delivery orchestration ====================
	async upsertProcessing(releaseId: string, dspId: string): Promise<void> {
		const existed = await this.repo.findOne({
			where: { releaseId, dspId },
		});

		const data = {
			status: ReleaseDspStatus.PROCESSING,
			lastEnqueuedAt: new Date(),
			lastDeliveredAt: null as Date | null,
			isSelected: true,
		};

		if (!existed) {
			await this.repo.save({ releaseId, dspId, ...data });
		} else {
			await this.repo.update({ releaseId, dspId }, data);
		}
	}

	async markDistributed(releaseId: string, dspId: string): Promise<void> {
		await this.repo.update(
			{ releaseId, dspId },
			{
				status: ReleaseDspStatus.DISTRIBUTED,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: new Date(),
			},
		);
	}

	async markIssues(releaseId: string, dspId: string): Promise<void> {
		await this.repo.update(
			{ releaseId, dspId },
			{
				status: ReleaseDspStatus.ISSUES,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: null,
			},
		);
	}

	async updateMetadataInfo(
		releaseId: string,
		dspId: string,
		info: { metadataPath?: string; batchId?: string },
	): Promise<void> {
		await this.repo.update({ releaseId, dspId }, info);
	}

	async updateSelected(releaseId: string, dspIds: string[]): Promise<void> {
		await this.repo.update({ releaseId }, { isSelected: false });

		if (dspIds.length > 0) {
			await this.repo.update(
				{ releaseId, dspId: In(dspIds) },
				{ isSelected: true },
			);
		}
	}

	async ensureDeliveriesExist(
		releaseId: string,
		activeDspIds: string[],
	): Promise<void> {
		const existing = await this.repo.find({
			where: { releaseId },
			select: ['dspId'],
		});

		const existIds = new Set(existing.map((d) => d.dspId));

		const newRecords = activeDspIds
			.filter((id) => !existIds.has(id))
			.map((dspId) => ({
				releaseId,
				dspId,
				status: ReleaseDspStatus.NEVER_DISTRIBUTED,
				lastEnqueuedAt: null as Date | null,
				lastDeliveredAt: null as Date | null,
			}));

		if (newRecords.length) {
			await this.repo.insert(newRecords);
		}
	}

	async findReleaseDspDeliveryId(
		releaseId: string,
		dspId: string,
	): Promise<string | null> {
		const record = await this.repo.findOne({
			where: { releaseId, dspId },
			select: ['id'],
		});
		return record?.id ?? null;
	}

	// crud
	async bulkUpdate(input: {
		data: {
			items: {
				id: string;
				[key: string]: any;
			}[];
		};
		manager?: EntityManager;
	}) {
		const { data, manager } = input;
		const repo = this.getRepo(manager);

		await repo.save(data.items);

		return true;
	}

	async create(input: {
		data: CreateReleaseDspDeliveryDto;

		manager?: EntityManager;
	}) {
		const { data, manager } = input;
		const repo = this.getRepo(manager);

		await this.validateUnique(data, manager);

		const entity = repo.create({
			...data,
		});

		return repo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOneBy({ id });
		if (!entity) throw ReleaseDspDeliveryException.NOT_FOUND();
		return entity;
	}

	async update(input: {
		id: string;
		data: UpdateReleaseDspDeliveryDto;
		manager?: EntityManager;
	}) {
		const { id, data, manager } = input;
		const repo = this.getRepo(manager);

		await this.findOne(id);

		// unique check only when releaseId + dspId both provided in update
		if (data.releaseId && data.dspId) {
			await this.validateUnique(
				{ releaseId: data.releaseId, dspId: data.dspId },
				manager,
				id,
			);
		}

		await repo.update(id, {
			...data,
		});

		return this.findOne(id);
	}

	async getList(filter: GetListReleaseDspDeliveriesDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
	}

	// private
	private async validateUnique(
		data: Pick<CreateReleaseDspDeliveryDto, 'releaseId' | 'dspId'>,
		manager?: EntityManager,
		excludeId?: string,
	) {
		const repo = this.getRepo(manager);
		const existed = await repo.findOne({
			where: {
				releaseId: data.releaseId,
				dspId: data.dspId,
			},
		});

		if (existed && existed.id !== excludeId) {
			throw ReleaseDspDeliveryException.DUPLICATED();
		}
	}

	protected getRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(ReleaseDspDelivery) : this.repo;
	}
}
