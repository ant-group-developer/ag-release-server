import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { SftpConnectService } from 'src/modules/distribution/sftp-connect/sftp-connect.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ErnVersion } from 'src/modules/ern/interfaces/ern-input.interface';
import { ReleaseDspDeliveryService } from 'src/modules/release-dsp-delivery/services/release-dsp-delivery.service';
import { removeFolder } from 'src/utils/util';
import { In, Repository } from 'typeorm';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { ReleaseLogService } from './release-log.service';
import { ReleaseDdexService } from './release-ddex.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';
import { TrackService } from 'src/modules/track/services/track.service';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { AppConfigService } from 'src/modules/app-config/app-config.service';

@Injectable()
export class ReleaseDeliveryService {
	private readonly logger = new Logger(ReleaseDeliveryService.name);

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly releaseQueryService: ReleaseQueryService,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseLogService: ReleaseLogService,

		private readonly releaseDdexService: ReleaseDdexService,
		private readonly deliveryService: ReleaseDspDeliveryService,
		private readonly dspRoutingService: DspRoutingConfigsService,
		private readonly sftpConnectService: SftpConnectService,

		private readonly trackService: TrackService,
		private readonly upcService: UpcService,
		private readonly appConfigService: AppConfigService,
	) {}

	// ==================== Public API ====================

	async submit(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseRepo.update(id, { status: ReleaseStatus.PROCESSING });
		// await this.handleSelected(id, dto.code);

		this.releaseLogService.pending({
			releaseId: id,
			step: 'Bắt đầu xử lý phát hành',
			message: 'Bản phát hành đang được đưa vào hàng đợi xử lý',
		});

		this.processingSubmit({ id, userId, dto }).catch(async (error) => {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.ISSUES,
			});

			this.releaseLogService.failed({
				releaseId: id,
				step: 'Lỗi phát hành',
				message: `Lỗi bất ngờ: ${error?.message ?? 'Không xác định'}`,
			});
		});

		return { message: 'Đang được xử lý' };
	}

	// ==================== Orchestration ====================

	private async processingSubmit({
		id,
		userId,
		dto,
	}: {
		id: string;
		userId: string;
		dto: SubmitReleaseDto;
	}) {
		const release = await this.releaseQueryService.findOneWithRelation(id);

		// Gen UPC / ISRC if needed
		if (!release.upc) {
			await this.genUpc(id);
		}

		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}

		// Validate
		const errors =
			this.releaseValidateService.getErrorsSchemaRelease(release);

		if (errors.length > 0) {
			this.releaseLogService.failed({
				releaseId: id,
				step: 'Kiểm tra dữ liệu phát hành (Validation)',
				message: errors
					.map((e) => e?.message ?? 'Lỗi không xác định')
					.join(', '),
			});

			throw new ResponseError({
				message:
					'Release validation failed. Please check the input data.',
				data: errors,
			});
		}

		// Distribute to all DSPs
		const dspErrors = await this.distribute(id, dto.code);

		if (!dspErrors || dspErrors.length === 0) {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.DISTRIBUTED,
			});
		} else {
			await this.releaseRepo.update(id, {
				status: ReleaseStatus.ISSUES,
			});
		}
	}

	/**
	 * Unified distribution — processes all DSPs concurrently.
	 * No if/else per DSP code. Uses Promise.allSettled for parallel execution.
	 */
	private async distribute(
		releaseId: string,
		codes: string[],
	): Promise<string[]> {
		const results = await Promise.allSettled(
			codes.map((code) => this.processDsp(releaseId, code)),
		);

		return results
			.filter(
				(r): r is PromiseRejectedResult => r.status === 'rejected',
			)
			.map(
				(r, i) =>
					`${codes[results.indexOf(r)]}: ${r.reason?.message ?? 'Unknown error'}`,
			);
	}

	/**
	 * Single unified DSP processor — works for ALL DSPs.
	 * Config-driven: no branching by DSP code.
	 */
	private async processDsp(
		releaseId: string,
		code: string,
	): Promise<void> {
		let dsp: Dsp | null = null;
		let deliveryId: string | null = null;

		try {
			dsp = await this.dspRepo.findOne({ where: { code } });
			if (!dsp) {
				throw new ResponseError({ message: `Hệ thống chưa hỗ trợ hoặc thiếu cấu hình DSP ${code}` });
			}

			// 1. Resolve config from DB
			const config =
				await this.dspRoutingService.resolveFullDeliveryConfig(code);

			// 2. Mark as processing
			await this.deliveryService.upsertProcessing(releaseId, dsp.id);
			deliveryId = await this.deliveryService.findDeliveryId(
				releaseId,
				dsp.id,
			);
			
			// 3. Create metadata on server (stateless — returns path, no DB write)
			const { outputDir, batchId } =
				await this.releaseDdexService.createMetadataOnServer({
					releaseId,
					ernVersion: config.ernVersion as ErnVersion,
					sender: config.sender,
					recipient: config.recipient,
				});

			// 4. Save metadata path to delivery record
			await this.deliveryService.updateMetadataInfo(
				releaseId,
				dsp.id,
				{ metadataPath: outputDir, batchId },
			);

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
					this.logger.warn(`[SFTP_UPLOAD] Upload metadata DSP ${code} thất bại lần ${i}/3: ${err.message}`);
					if (i < 3) {
						await new Promise((res) => setTimeout(res, 3000)); // Đợi 3s trước khi thử lại
					}
				}
			}

			if (!uploadSuccess) {
				throw new Error(`Upload SFTP thất bại sau 3 lần thử nghiệm: ${lastUploadErr?.message}`);
			}

			// 6. Post-upload hooks (e.g. CI aggregator .done folder)
			if (config.createsDoneFolder) {
				const batchFolder = path.basename(outputDir);
				await this.createDoneFolderOnSftp(config.sftp, batchFolder);
			}

			// 7. Cleanup local files
			await removeFolder(outputDir);

			// 8. Mark success
			await this.deliveryService.markDistributed(releaseId, dsp.id);

			this.releaseLogService.success({
				releaseId,
				step: `Ghi nhận DSP ${dsp.name}`,
				message: `Tạo dữ liệu và đóng gói gửi DSP ${dsp.name} thành công`,
				codeDsp: code,
				dspId: dsp.id,
				deliveryId,
			});
		} catch (error) {
			if (dsp) {
				await this.deliveryService.markIssues(releaseId, dsp.id);
			}

			const dspName = dsp?.name ?? code;

			this.releaseLogService.failed({
				releaseId,
				step: `Ghi nhận DSP ${dspName}`,
				message: `Quá trình xử lý DSP ${dspName} thất bại: ${error?.message ?? 'Lỗi không xác định'}`,
				codeDsp: code,
				dspId: dsp?.id,
				deliveryId,
			});

			throw error;
		}
	}

	// ==================== Helpers ====================

	// private async handleSelected(releaseId: string, codes: string[]) {
	// 	const normalizedCodes = [
	// 		...new Set((codes || []).map((i) => i?.trim()).filter(Boolean)),
	// 	];

	// 	const dsps = await this.dspRepo.find({
	// 		where: { code: In(normalizedCodes) },
	// 		select: ['id', 'code'],
	// 	});

	// 	const dspIds = dsps.map((dsp) => dsp.id);
	// 	await this.deliveryService.updateSelected(releaseId, dspIds);
	// }

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

	private async genUpc(releaseId: string) {
		const release = await this.releaseQueryService.getOneDetail(releaseId);

		if (release.upc) {
			return { upc: release.upc, alreadyExists: true };
		}

		const prefixUpcId =
			this.appConfigService.cache.config.generator.prefixUpcDefaultId;

		if (!prefixUpcId) {
			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				content: release,
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});

			throw new ResponseError({
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});
		}

		const res = await this.upcService.getUpc({ prefixUpcId });

		const newUpc = res.upc;
		if (!newUpc) {
			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				content: release,
				message: 'Dịch vụ cấp UPC không phản hồi mã GTIN',
			});

			throw new ResponseError({
				message: 'Service UPC không trả về GTIN',
			});
		}

		await this.releaseRepo.update(releaseId, { upc: newUpc });
		return newUpc;
	}
}
