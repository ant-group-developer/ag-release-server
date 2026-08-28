import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import axios from 'axios';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { UpcService } from 'src/modules/external/upc/upc.service';
import { FileExportCiService } from 'src/modules/file-export-ci/file-export-ci.service';
import {
	CiDspStatus,
	CiExportService,
} from 'src/modules/partners-api/ci/services/ci-export.service';
import { CiReleaseService } from 'src/modules/partners-api/ci/services/ci-release.service';
import { UserFromRequest } from 'src/modules/token/token.interface';
import { TrackService } from 'src/modules/track/services/track.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import {
	getFileCsvFromRaw,
	getFileExcelFromRaw,
	getFileTxtFromRelease,
} from 'src/utils/util.file';
import { PassThrough } from 'stream';
import { Repository } from 'typeorm';
import {
	AutoSubmitUndistributedMusicReleaseDto,
	BulkSubmitReleaseDto,
	FileExportReleaseCiDto,
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { SubmitReleaseDto } from '../dto/submit-release.dto';
import { AutoSubmitHistory } from '../entities/auto-submit-history.entity';
import { Release } from '../entities/release.entity';
import { ReleaseDspStatus } from '../enum/release-dsp.enum';
import { ReleaseStatus } from '../enum/release.enum';
import { IRelease, IReleaseDetail } from '../interfaces/release.interface';
import { ReleaseCiQaFlag } from '../modules/release-ci-data/entities/release-ci-data.entity';
import { ReleaseCiDataService } from '../modules/release-ci-data/services/release-ci-data.service';
import { ReleaseExecutionResultDto } from '../modules/release-executions3/dtos/release-execution3.dto';
import { ExecutionType } from '../modules/release-executions3/enums/release-execution3.enum';
import { ReleaseExecution3Service } from '../modules/release-executions3/services/release-execution3.service';
import { ReleaseLogService } from '../modules/release-log/services/release-log.service';
import { UpdateReleaseReviewDecisionDto } from '../modules/release-reviews/dto/release-review.dto';
import { ReleaseReviewService } from '../modules/release-reviews/services/release-review.service';
import {
	enhanceReleasesDetails,
	normalizeMetadataExternal,
} from '../utils/release.utils';
import { ReleaseDdexService } from './release-ddex.service';
import { ReleaseDspDeliveryService } from './release-dsp-services/release-dsp-delivery.service';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

type AutoSubmitUndistributedMusicReleaseItem = {
	releaseId: string;
	upc: string | null;
	dspCodes: string[];
	releaseDspDeliveries: {
		id: string | null;
		dspId: string;
		dspCode: string;
		status: ReleaseDspStatus | null;
	}[];
};

@Injectable()
export class ReleaseService {
	private readonly logger = new Logger('ReleaseSpotifyService');
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(AutoSubmitHistory)
		private readonly autoSubmitHistoryRepo: Repository<AutoSubmitHistory>,

		private readonly releaseLogService: ReleaseLogService,

		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,

		private readonly bucketService: BucketService2,

		private readonly upcService: UpcService,
		private readonly trackService: TrackService,
		private readonly appConfigService: AppConfigService,

		private readonly fileExportCiService: FileExportCiService,

		// partners api
		private readonly ciReleaseService: CiReleaseService,
		private readonly ciExportService: CiExportService,

		private readonly releaseDdexService: ReleaseDdexService,

		@Inject(forwardRef(() => ReleaseExecution3Service))
		private readonly releaseExecution3Service: ReleaseExecution3Service,

		@Inject(forwardRef(() => ReleaseReviewService))
		private readonly releaseReviewService: ReleaseReviewService,

		@Inject(forwardRef(() => ReleaseDspDeliveryService))
		private readonly releaseDspDeliveryService: ReleaseDspDeliveryService,

		@Inject(forwardRef(() => ReleaseCiDataService))
		private readonly releaseCiDataService: ReleaseCiDataService,
	) {}

	async getOne(id: string): Promise<IReleaseDetail> {
		const release = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return normalizeMetadataExternal({
			...restOfRelease,
			coverArtThumbnails,
		});
	}

	async findOneFull(id: string) {
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails = getCoverArtThumbnails(releaseCoverArts);

		return normalizeMetadataExternal({
			...restOfRelease,
			coverArtThumbnails,
		});
	}

	async updateReleaseReview(
		releaseId: string,
		body: UpdateReleaseReviewDecisionDto,
		reviewerId: string,
	) {
		return this.releaseReviewService.handleResultReviewRelease(
			releaseId,
			body,
			reviewerId,
		);
	}

	async getList(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<IReleaseDetail>> {
		const { page, pageSize } = query;

		const { releases, totalItems } =
			await this.releaseQueryService.getManyAndCount(query);

		const enhancedRelease = enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListFull(query: QueryGetListReleaseDto) {
		const { items, totalItems } =
			await this.releaseQueryService.getListFull(query);

		return new PageDto({
			items: items.map((item) => normalizeMetadataExternal(item)),
			metadata: {
				...query,
				totalItems,
			},
		});
	}

	async getList2(
		query: QueryGetListReleaseDto2,
		user: UserFromRequest,
	): Promise<PageDto<IReleaseDetail>> {
		const { page, pageSize } = query;

		const { releases, totalItems } =
			await this.releaseQueryService.getManyAndCountOptimized(
				query,
				user,
			);

		const enhancedRelease = enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<Release>> {
		const { page, pageSize } = query;

		const { items, totalItems } =
			await this.releaseQueryService.getListSimple(query);

		return new PageDto({
			items: items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	// file export ci
	async listCodeExportCiById(id: string) {
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
			relations: ['release.releaseDspDeliveries'],
		});

		return release.listCodeExportCi;
	}

	async dataExportCiById(id: string) {
		const { listCodeExportCi, upc } =
			await this.releaseQueryService.findOneReleaseFull({
				releaseId: id,
				relations: ['release.releaseDspDeliveries'],
			});

		return {
			listCodeDspCi: listCodeExportCi,
			upc,
		};
	}

	async listDataExportCi(query: QueryGetListReleaseDto2) {
		const res = await this.getListFull(query);
		const records = res.items.map((r) => this.dataExportCi(r));

		return records;
	}

	dataExportCi(release: Release) {
		return {
			listCodeDspCi: release.listCodeExportCi,
			upc: release.upc,
		};
	}

	async getFileExportCiById(id: string) {
		const record = await this.dataExportCiById(id);

		return await this.fileExportCiService.createFileExportCi({
			data: [record],
		});
	}

	async getFileExportListReleaseCi(query: QueryGetListReleaseDto2) {
		const res = await this.getListFull(query);

		const records = res.items
			.filter((r) => r.upc != null)
			.map((r) => this.dataExportCi(r));

		const result = await this.fileExportCiService.createFileExportCi({
			data: records,
		});

		return result;
	}

	async getFileExportListReleaseCiByDspCode(data: FileExportReleaseCiDto) {
		const query = new QueryGetListReleaseDto();
		query.ids = data.ids;

		const res = await this.getListFull(query);

		const records = res.items.map((r) => ({
			listCodeDspCi: data.dspCodeCi,
			upc: r.upc,
		}));

		const result = await this.fileExportCiService.createFileExportCi({
			data: records,
		});

		return result;
	}

	//
	async update(
		id: string,
		data: UpdateReleaseDto,
		userId?: string,
	): Promise<IRelease> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		const release = await this.releaseQueryService.findOne(id);

		if (release.status === ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Error release.status',
			});
		}

		if (labelId && labelId !== release.labelId) {
			await this.releaseValidateService.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.releaseValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.releaseValidateService.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.releaseValidateService.validate({
				releaseTimezoneId,
			});
		}

		await this.releaseRepo.update(id, {
			...data,
			isSentMetadataCi: false,
			modifierId: userId,

			// chuyển sang dạng tạo trực tiếp → tránh vấn đề sau này chạy xoá release import thì bị mất luôn release user đã sửa
			isImportedFromReport: false,
			importSourceType: null,
			importParserCode: null,
			importFileName: null,
			importJobId: null,
		});
		return await this.releaseQueryService.findOne(id);
	}

	async getFileCsvMetadata(releaseId: string) {
		const dataRaw =
			await this.releaseQueryService.getMetadataRaw(releaseId);
		return getFileCsvFromRaw({
			records: [dataRaw],
			fileName: dataRaw.release_name,
		});
	}

	async getFileXlsxMetadata(releaseId: string) {
		const dataRaw =
			await this.releaseQueryService.getMetadataRaw(releaseId);
		return getFileExcelFromRaw({
			records: [dataRaw],
			fileName: dataRaw.release_name,
		});
	}

	async getFileTxtMetadata(releaseId: string) {
		const release = await this.releaseQueryService.getMetadata(releaseId);
		return getFileTxtFromRelease({
			release,
			fileName: release.title,
		});
	}

	async getAssets(releaseId: string) {
		const zipStream = new PassThrough();
		const archive = archiver('zip', { zlib: { level: 9 } });
		archive.pipe(zipStream);

		const { releaseName, coverArt, listAudios } =
			await this.releaseQueryService.getFileIdAssetsRelease(releaseId);

		if (coverArt.fileId) {
			const streamCoverArt = await this.streamFileOnBucket(
				coverArt.fileId,
			);
			archive.append(streamCoverArt.stream, {
				name: coverArt.name || 'cover.jpg',
			});
		}

		for (const item of listAudios) {
			if (item.fileId) {
				const streamAudio = await this.streamFileOnBucket(item.fileId);

				archive.append(streamAudio.stream, {
					name: item.name || 'item.wav',
				});
			}
		}

		archive.finalize().catch((_e) => {});

		return {
			contentType: 'application/zip',
			stream: zipStream,
			fileName: `${releaseName}assets.zip`,
		};
	}

	async getCoverArtStream(releaseId: string) {
		const { coverArt } =
			await this.releaseQueryService.getFileIdAssetsRelease(releaseId);

		const { stream, contentType } = await this.streamFileOnBucket(
			coverArt.fileId,
		);

		return {
			stream,
			contentType,
			fileName: coverArt.name,
		};
	}

	private async streamFileOnBucket(fileId?: string | null) {
		if (!fileId) {
			throw new ResponseError({ message: 'Resource not found' });
		}

		const url = await this.bucketService.getUrlDown(fileId);
		return this.getStream(url);
	}

	private async getStream(url: string) {
		const response = await axios.get(url, {
			responseType: 'stream',
		});

		return {
			stream: response.data,
			contentType: response.headers['content-type'],
		};
	}

	// async genUpcById(releaseId: string) {
	// 	// return '0850080651804';
	// 	const release = await this.releaseQueryService.getOneDetail(releaseId);

	// 	// Nếu release đã có UPC
	// 	if (release.upc) {
	// 		return release.upc ?? '';
	// 	}

	// 	const prefixUpcId =
	// 		this.appConfigService.cache.config.generator.prefixUpcDefaultId;

	// 	if (!prefixUpcId) {
	// 		this.releaseLogService.failed({
	// 			releaseId,
	// 			step: 'Khởi tạo UPC',
	// 			content: release,
	// 			message: 'Bản phát hành chưa được gắn mã Prefix UPC',
	// 		});

	// 		throw new ResponseError({
	// 			message: 'Bản phát hành chưa được gắn mã Prefix UPC',
	// 		});
	// 	}

	// 	const res = await this.upcService.getUpc({ prefixUpcId });

	// 	const newUpc = res.upc;
	// 	if (!newUpc) {
	// 		this.releaseLogService.failed({
	// 			releaseId,
	// 			step: 'Khởi tạo UPC',
	// 			content: release,
	// 			message: 'Dịch vụ cấp UPC không phản hồi mã GTIN',
	// 		});

	// 		throw new ResponseError({
	// 			message: 'Service UPC không trả về GTIN',
	// 		});
	// 	}

	// 	// -------- Update release --------
	// 	await this.releaseRepo.update(releaseId, { upc: newUpc });

	// 	return newUpc;
	// }

	// Gen upc v2
	async genUpcById(releaseId: string): Promise<string> {
		const prefixUpcId =
			this.appConfigService.cache.config.generator.prefixUpcDefaultId;

		if (!prefixUpcId) {
			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});

			throw new ResponseError({
				message: 'Bản phát hành chưa được gắn mã Prefix UPC',
			});
		}

		const maxAttempts = 10;

		try {
			return await this.releaseRepo.manager.transaction(
				async (transactionManager) => {
					/*
					 * Chỉ cho phép một worker gen UPC trên cùng prefix
					 * tại một thời điểm.
					 *
					 * Lock này dùng chung giữa tất cả pod/process đang
					 * kết nối vào cùng PostgreSQL.
					 *
					 * Lock tự động được nhả khi transaction commit/rollback.
					 */
					await transactionManager.query(
						`
                        SELECT pg_advisory_xact_lock(
                            hashtextextended($1, 0)
                        )
                    `,
						[`release:generate-upc:${prefixUpcId}`],
					);

					/*
					 * Đọc release sau khi đã lấy advisory lock.
					 *
					 * pessimistic_write tương đương SELECT ... FOR UPDATE,
					 * bảo vệ release trước những code path khác update cùng row
					 * nhưng không sử dụng advisory lock.
					 */
					const release = await transactionManager
						.getRepository(Release)
						.createQueryBuilder('release')
						.setLock('pessimistic_write')
						.where('release.id = :releaseId', { releaseId })
						.getOne();

					if (!release) {
						throw new ResponseError({
							message: 'Không tìm thấy bản phát hành',
						});
					}

					/*
					 * Worker khác có thể đã gen UPC trong lúc request hiện tại
					 * đang chờ advisory lock.
					 */
					const currentUpc = release.upc?.trim();

					if (currentUpc) {
						return currentUpc;
					}

					for (let attempt = 1; attempt <= maxAttempts; attempt++) {
						/*
						 * Gọi dịch vụ UPC.
						 *
						 * Do đang giữ advisory lock, worker khác dùng cùng
						 * prefix chưa thể gọi đoạn này đồng thời.
						 */
						const response = await this.upcService.getUpc({
							prefixUpcId,
							description: release?.title,
						});

						const generatedUpc = response.upc?.trim();

						if (!generatedUpc) {
							throw new ResponseError({
								message: 'Dịch vụ UPC không trả về mã GTIN',
							});
						}

						/*
						 * Kiểm tra UPC đã thuộc release khác chưa.
						 *
						 * Bỏ các số 0 ở đầu khi so sánh để coi UPC-12 và
						 * GTIN-14 tương đương nhau, ví dụ:
						 *
						 * 850080651766
						 * 00850080651766
						 */
						const duplicatedRelease = await transactionManager
							.getRepository(Release)
							.createQueryBuilder('otherRelease')
							.select([
								'otherRelease.id',
								'otherRelease.title',
								'otherRelease.upc',
							])
							.where(
								`
                                    TRIM(
                                        LEADING '0'
                                        FROM BTRIM(otherRelease.upc)
                                    ) =
                                    TRIM(
                                        LEADING '0'
                                        FROM :generatedUpc
                                    )
                                `,
								{ generatedUpc },
							)
							.andWhere('otherRelease.id <> :releaseId', {
								releaseId,
							})
							.getOne();

						if (duplicatedRelease) {
							this.logger.warn(
								[
									'[GEN_UPC] UPC service returned a duplicate',
									`upc=${generatedUpc}`,
									`releaseId=${releaseId}`,
									`existingReleaseId=${duplicatedRelease.id}`,
									`existingReleaseTitle=${duplicatedRelease.title}`,
									`attempt=${attempt}/${maxAttempts}`,
								].join(', '),
							);

							// Gọi UPC service lần nữa để lấy mã tiếp theo.
							continue;
						}

						/*
						 * Chỉ update nếu UPC hiện vẫn null/rỗng.
						 *
						 * Điều kiện này là lớp bảo vệ bổ sung, tránh vô tình
						 * ghi đè UPC nếu có code path khác vừa gắn UPC.
						 */
						const updateResult = await transactionManager
							.getRepository(Release)
							.createQueryBuilder()
							.update(Release)
							.set({
								upc: generatedUpc,
							})
							.where('id = :releaseId', { releaseId })
							.andWhere(`(upc IS NULL OR BTRIM(upc) = '')`)
							.execute();

						if (updateResult.affected !== 1) {
							/*
							 * Không update được có thể vì UPC của release đã
							 * được gắn bởi một luồng khác.
							 */
							const latestRelease = await transactionManager
								.getRepository(Release)
								.findOne({
									where: { id: releaseId },
									select: {
										id: true,
										upc: true,
									},
								});

							const latestUpc = latestRelease?.upc?.trim();

							if (latestUpc) {
								return latestUpc;
							}

							throw new ResponseError({
								message: 'Không thể lưu UPC cho bản phát hành',
							});
						}

						this.logger.log(
							[
								'[GEN_UPC] UPC assigned successfully',
								`releaseId=${releaseId}`,
								`upc=${generatedUpc}`,
								`attempt=${attempt}/${maxAttempts}`,
							].join(', '),
						);

						/*
						 * Callback trả kết quả:
						 * TypeORM commit transaction và PostgreSQL tự nhả
						 * advisory lock cùng row lock.
						 */
						return generatedUpc;
					}

					/*
					 * UPC service liên tục trả mã đã tồn tại.
					 * Throw sẽ rollback transaction và tự nhả lock.
					 */
					throw new ResponseError({
						message:
							`Không thể cấp UPC duy nhất sau ` +
							`${maxAttempts} lần thử`,
					});
				},
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Không thể khởi tạo UPC';

			this.releaseLogService.failed({
				releaseId,
				step: 'Khởi tạo UPC',
				message,
			});

			throw error;
		}
	}

	async genListIsrcByReleaseId(releaseId: string) {
		const release =
			await this.releaseQueryService.findOneWithRelation(releaseId);
		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}
	}

	async genListIsrc(release: Release) {
		for (const track of release.tracks) {
			if (!track.isrc) {
				await this.trackService.genISRC(track.id);
			}
		}
	}

	async bulkSubmit(dto: BulkSubmitReleaseDto) {
		const idsExclude = new Set(dto.idsExclude ?? []);

		for (const id of dto.ids) {
			if (idsExclude.has(id)) continue;

			const { submitData } = await this.previewBulkSubmitResult({
				...dto,
				ids: [id],
			});

			await this.submit3(id, submitData);
		}
	}

	async previewBulkSubmitResult(dto: BulkSubmitReleaseDto) {
		const targets = dto.codes
			.map((code) => ({
				code: code?.trim().toUpperCase(),
				targetStatus: dto.status ?? ReleaseDspStatus.DISTRIBUTED,
			}))
			.filter(
				(
					item,
				): item is {
					code: string;
					targetStatus: ReleaseDspStatus;
				} => Boolean(item.code) && Boolean(item.targetStatus),
			);
		const targetStatusByDspCode = new Map(
			targets.map((item) => [item.code, item.targetStatus]),
		);

		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: dto.ids[0],
			relations: ['release.releaseDspDeliveries'],
		});

		this.applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain);

		const releaseDspDeliveries = (release.releaseDspDeliveries ?? []).map(
			(delivery) => {
				const { status, ...rest } = delivery;
				const dspCode = delivery.dsp?.code?.trim().toUpperCase() ?? '';
				const targetStatus = targetStatusByDspCode.get(dspCode);
				const shouldChangeStatus =
					targetStatus &&
					(!(dto.skipDistributed ?? true) ||
						status !== ReleaseDspStatus.DISTRIBUTED);

				return {
					...rest,
					status,
					...(shouldChangeStatus ? { targetStatus } : {}),
				};
			},
		);
		release.releaseDspDeliveries = releaseDspDeliveries;

		const submitCodes = releaseDspDeliveries
			.filter((delivery) => Boolean(delivery.targetStatus))
			.map((delivery) => delivery.dsp?.code)
			.filter((code): code is string => Boolean(code));

		const skipCodes = releaseDspDeliveries
			.filter(
				(delivery) =>
					targetStatusByDspCode.has(
						delivery.dsp?.code?.trim().toUpperCase() ?? '',
					) && !delivery.targetStatus,
			)
			.map((delivery) => delivery.dsp?.code)
			.filter((code): code is string => Boolean(code));

		return {
			...release,
			submitData: {
				id: release.id,
				code: submitCodes,
				skipCodes,
				needImportAgain: release.ciData?.needImportAgain,
			},
		};
	}

	async autoSubmitUndistributedMusicReleases(
		dto: AutoSubmitUndistributedMusicReleaseDto,
	) {
		const items =
			await this.getAutoSubmitUndistributedMusicReleaseItems(dto);
		await this.saveAutoSubmitHistory(dto, items);

		const errors: {
			releaseId: string;
			dspCodes: string[];
			message: string;
		}[] = [];
		let submitted = 0;

		for (const item of items) {
			try {
				await this.submit3(item.releaseId, { code: item.dspCodes });
				submitted++;
			} catch (error) {
				errors.push({
					releaseId: item.releaseId,
					dspCodes: item.dspCodes,
					message:
						error instanceof Error ? error.message : String(error),
				});
			}
		}

		const result = {
			totalReleases: items.length,
			submitted,
			failed: errors.length,
			errors,
		};

		return result;
	}

	async previewAutoSubmitUndistributedMusicReleases(
		dto: AutoSubmitUndistributedMusicReleaseDto,
	) {
		const items =
			await this.getAutoSubmitUndistributedMusicReleaseItems(dto);

		const result = {
			totalReleases: items.length,
			items,
		};

		await this.saveAutoSubmitHistory(dto, items);

		return result;
	}

	private async getAutoSubmitUndistributedMusicReleaseItems(
		dto: AutoSubmitUndistributedMusicReleaseDto,
	): Promise<AutoSubmitUndistributedMusicReleaseItem[]> {
		const batchSize = 30;
		const dspCodes = [
			...new Set(
				dto.dspCodes
					.map((code) => code?.trim().toUpperCase())
					.filter(Boolean),
			),
		];
		const items: AutoSubmitUndistributedMusicReleaseItem[] = [];
		let offset = 0;
		let batchNumber = 0;

		this.logger.log(
			`Start parsing auto-submit undistributed music releases. DSP codes: ${dspCodes.join(', ')}`,
		);

		while (true) {
			batchNumber++;
			const rows = await this.releaseRepo.query(
				`
					SELECT
						r."id" AS "releaseId",
						r."upc" AS "upc",
						array_agg(dsp."code" ORDER BY dsp."code") AS "dspCodes",
						jsonb_agg(
							jsonb_build_object(
								'id', rdd."id",
								'dspId', dsp."id",
								'dspCode', dsp."code",
								'status', rdd."status"
							)
							ORDER BY dsp."code"
						) AS "releaseDspDeliveries"
					FROM "release_ci_data" rcd
					INNER JOIN "releases" r
						ON r."id" = rcd."release_id"
					INNER JOIN "dsps" dsp
						ON upper(trim(dsp."code")) = ANY($1::text[])
					LEFT JOIN "release_dsp_delivery" rdd
						ON rdd."release_id" = r."id"
						AND rdd."dsp_id" = dsp."id"
					WHERE r."type" = 'audio'
					AND ($3::text IS NULL OR rcd."status"::text = $3)
					AND (
						$4::boolean IS NOT TRUE
						OR (
						rcd."export_parsed_data" IS NULL
						OR jsonb_array_length(rcd."export_parsed_data") = 0
						)
					)
					AND (
						$5::boolean IS NOT TRUE
						OR rcd."import_parsed_data" ->> 'status' = 'problem'
					)
					AND (
						rdd."id" IS NULL
						OR rdd."status" != $2
					)
					GROUP BY r."id", r."upc", rcd."updated_at"
					ORDER BY rcd."updated_at" DESC, r."id" ASC
					LIMIT $6 OFFSET $7
				`,
				[
					dspCodes,
					ReleaseDspStatus.DISTRIBUTED,
					dto.status ?? null,
					dto.neverExported ?? false,
					dto.lastImportIsFailed ?? false,
					batchSize,
					offset,
				],
			);

			if (!rows.length) break;

			items.push(...rows);
			this.logger.log(
				`Parsed auto-submit batch ${batchNumber}. Batch items: ${rows.length}, total parsed: ${items.length}`,
			);
			offset += batchSize;
		}

		this.logger.log(
			`Finished parsing auto-submit undistributed music releases. Total parsed: ${items.length}`,
		);

		return items;
	}

	private async saveAutoSubmitHistory(
		dto: AutoSubmitUndistributedMusicReleaseDto,
		items: AutoSubmitUndistributedMusicReleaseItem[],
	) {
		await this.autoSubmitHistoryRepo.save({
			input: dto,
			previewData: {
				totalReleases: items.length,
				items,
			},
			totalReleases: items.length,
		});
	}

	/**
	 * Adjust CI snapshot before creating execution.
	 *
	 * This does not write DB. Execution import/skip logic is driven by
	 * `needImportAgain`, so keep the current CI status and only override that flag.
	 */
	private applyCiImportActionToReleaseSnapshot(
		release: Release | null | undefined,
		requestedNeedImportAgain?: boolean,
	) {
		if (!release?.ciData) return;

		const currentNeedImportAgain = release.ciData.needImportAgain;
		let needImportAgain = currentNeedImportAgain;

		if (requestedNeedImportAgain === true) {
			needImportAgain = true;
		} else if (
			requestedNeedImportAgain === false &&
			currentNeedImportAgain === true
		) {
			needImportAgain = false;
		}

		release.ciData = {
			needImportAgain,
		} as typeof release.ciData;
	}

	async submit3(id: string, dto: SubmitReleaseDto) {
		try {
			// await this.releaseCiDataService.syncCiDataByReleaseId(id);
			await this.releaseCiDataService.bulkSyncDataCi({ ids: [id] });
		} catch (error) {
			console.log(error);
		}

		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

		// truyền động từ fe để bỏ qua bước import ci, chứ ko lưu hay cập nhật release gốc
		this.applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain);

		await this.releaseRepo.update(id, {
			status: ReleaseStatus.SUBMITTED,
			releaseEndDate: null,
		});

		return this.releaseExecution3Service.newReleaseExecution({
			release,
			dspCodes: dto.code,
			type: ExecutionType.INITIAL_RELEASE,
		});
	}

	async takedown(id: string, userId: string, dto: SubmitReleaseDto) {
		await this.releaseQueryService.findOne(id);

		try {
			await this.releaseCiDataService.bulkSyncDataCi({ ids: [id] });
		} catch (error) {
			console.log(error); // Không chặn takedown nếu sync CI lỗi
		}

		const eligibility =
			await this.releaseDspDeliveryService.resolveTakedownEligibleDspCodes(
				id,
				dto.code,
			);

		if (!eligibility.eligibleCodes.length) {
			throw new ResponseError({
				message: 'Không có DSP nào đang có bản phát hành để takedown',
				data: { skipped: eligibility.skipped },
			});
		}

		const dspCodes = eligibility.eligibleCodes;

		const releaseEndDate = new Date();
		releaseEndDate.setDate(releaseEndDate.getDate() - 1); // Hôm qua
		await this.releaseRepo.update(id, {
			status: ReleaseStatus.SUBMITTED,
			releaseEndDate,
		});

		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

		this.applyCiImportActionToReleaseSnapshot(release, dto.needImportAgain);

		return this.releaseExecution3Service.newReleaseExecution({
			release,
			dspCodes,
			type: ExecutionType.TAKEDOWN,
		});
	}

	/**
	 * Lấy release format ID trên CI theo UPC của release và lưu vào `releaseFormatsIdCi`.
	 *
	 * `options.reloadFromCi` điều khiển việc dùng cache trong DB:
	 * - false/undefined: nếu release đã có `releaseFormatsIdCi` thì trả luôn giá trị đang lưu,
	 *   không gọi CI lại.
	 * - true: bỏ qua giá trị đang lưu, gọi CI lại theo UPC và update lại `releaseFormatsIdCi`.
	 */
	async getReleaseFormatId(
		id: string,
		options?: { reloadFromCi?: boolean },
	): Promise<string> {
		const release = await this.releaseQueryService.findOne(id);

		// Không reload thì ưu tiên dùng format ID đã sync trước đó để giảm request sang CI.
		if (!options?.reloadFromCi && release.releaseFormatsIdCi) {
			return release.releaseFormatsIdCi;
		}

		if (!release.upc) {
			throw new ResponseError({ message: 'Release chưa có UPC' });
		}

		const releaseFormat = await this.ciReleaseService.getReleaseFormatOneV2(
			{
				gtin: release.upc,
			},
		);

		const releaseFormatId = releaseFormat?.id;
		if (!releaseFormatId) {
			throw new ResponseError({ message: 'Không tìm thấy CI' });
		}

		const releaseFormatsIdCi = String(releaseFormatId);
		await this.releaseRepo.update(id, { releaseFormatsIdCi });

		return releaseFormatsIdCi;
	}

	/**
	 * Tự động đồng bộ `releaseFormatsIdCi` từ CI cho các release chưa import từ report.
	 *
	 * Mặc định chỉ lấy các release chưa có `releaseFormatsIdCi`.
	 * Nếu `reloadFromCi = true`, hàm sẽ gọi lại CI cho cả release đã có format ID
	 * để refresh giá trị đang lưu trong DB.
	 */
	async autoSyncReleaseFormatId(options?: { reloadFromCi?: boolean }) {
		const batchSize = 5;
		const query = this.releaseRepo
			.createQueryBuilder('release')
			.select(['release.id'])
			.where('release.isImportedFromReport = :isImportedFromReport', {
				isImportedFromReport: false,
			})
			.orderBy('release.createdAt', 'ASC');

		// Chế độ bình thường chỉ sync release còn thiếu format ID, tránh gọi CI lại không cần thiết.
		if (!options?.reloadFromCi) {
			query.andWhere('release.releaseFormatsIdCi IS NULL');
		}

		const releases = await query.getMany();

		let synced = 0;
		const failed: { releaseId: string; message: string }[] = [];
		const totalBatches = Math.ceil(releases.length / batchSize);

		this.logger.log(
			`Starting auto sync release format ID. Total pending: ${releases.length}, batch size: ${batchSize}`,
		);

		for (let index = 0; index < releases.length; index += batchSize) {
			// Chạy theo batch nhỏ để giới hạn số request gọi CI đồng thời.
			const batch = releases.slice(index, index + batchSize);
			const batchNumber = Math.floor(index / batchSize) + 1;
			const releaseIds = batch.map((release) => release.id);

			this.logger.log(
				`Processing release format ID batch ${batchNumber}/${totalBatches}. Release IDs: ${releaseIds.join(', ')}`,
			);

			// Dùng allSettled để một release lỗi không làm dừng toàn bộ job sync.
			const results = await Promise.allSettled(
				batch.map((release) =>
					this.getReleaseFormatId(release.id, {
						reloadFromCi: options?.reloadFromCi,
					}),
				),
			);

			results.forEach((result, resultIndex) => {
				const releaseId = batch[resultIndex].id;

				if (result.status === 'fulfilled') {
					// getReleaseFormatId đã update DB, ở đây chỉ ghi nhận tiến độ.
					synced += 1;
					this.logger.log(
						`Synced release format ID for release ${releaseId}: ${result.value}. Progress: ${
							synced + failed.length
						}/${releases.length}`,
					);
					return;
				}

				// Ghi lại lỗi theo từng release để caller biết record nào cần xử lý lại.
				const reason = result.reason;
				const message =
					reason instanceof Error ? reason.message : String(reason);

				failed.push({
					releaseId,
					message,
				});
				this.logger.error(
					`Failed to sync release format ID for release ${releaseId}. Progress: ${
						synced + failed.length
					}/${releases.length}. Error: ${message}`,
				);
			});

			this.logger.log(
				`Finished release format ID batch ${batchNumber}/${totalBatches}. Synced: ${synced}, failed: ${failed.length}`,
			);
		}

		this.logger.log(
			`Finished auto sync release format ID. Total: ${releases.length}, synced: ${synced}, failed: ${failed.length}`,
		);

		return {
			total: releases.length,
			batchSize,
			reloadFromCi: options?.reloadFromCi ?? false,
			synced,
			failed: failed.length,
			errors: failed,
		};
	}

	async getQaFlagsCi(
		id: string,
		options?: {
			reloadFromCi?: boolean | undefined; // true thì sẽ luôn cập data mới nhất nhưng tốn tài nguyên
		},
	): Promise<ReleaseCiQaFlag[]> {
		const releaseFormatsId = await this.getReleaseFormatId(id, options);
		const res2: { _embedded?: ReleaseCiQaFlag[] } =
			await this.ciReleaseService.getQaFlagsV2({
				releaseFormatsId,
			});
		return res2._embedded ?? [];
	}

	async getStatusDspsCi(id: string): Promise<ReleaseExecutionResultDto[]> {
		const releaseFormatId = await this.getReleaseFormatId(id);
		const ciStatuses = await this.ciExportService.getStatusDsps({
			releaseFormatId,
		});

		const release = await this.releaseRepo
			.createQueryBuilder('release')
			.leftJoinAndSelect(
				'release.releaseDspDeliveries',
				'releaseDspDelivery',
			)
			.leftJoinAndSelect('releaseDspDelivery.dsp', 'dsp')
			.where('release.id = :id', { id })
			.getOne();

		if (!release) {
			throw new ResponseError({ message: 'Release not found' });
		}

		const results: ReleaseExecutionResultDto[] = [];

		for (const ciStatus of ciStatuses) {
			const delivery = release.releaseDspDeliveries?.find(
				(item) =>
					item.dsp?.codeCi?.toLowerCase() ===
					ciStatus.ciCode.toLowerCase(),
			);

			if (!delivery?.dsp?.code) continue;

			results.push({
				id: delivery.id,
				dspId: delivery.dspId,
				dspCode: delivery.dsp.code,
				dspCodeCi: delivery.dsp.codeCi,
				status: this.mapCiDspStatusToReleaseDspStatus(ciStatus),
			});
		}

		return results;
	}

	public mapCiDspStatusToReleaseDspStatus(
		ciStatus: CiDspStatus,
	): ReleaseDspStatus {
		const { status, task, taskStatus } = ciStatus;

		// Priority 1: Use task + taskStatus if available (more accurate)
		if (task && taskStatus) {
			const normalizedTask = task.toLowerCase();
			const normalizedTaskStatus = taskStatus.toLowerCase();

			// TakeDown
			if (normalizedTask === 'takedown') {
				if (normalizedTaskStatus === 'complete') {
					return ReleaseDspStatus.TAKEN_DOWN;
				}
				if (normalizedTaskStatus === 'processing') {
					return ReleaseDspStatus.PROCESSING;
				}
			}

			// Distribute
			if (normalizedTask === 'distribute') {
				if (normalizedTaskStatus === 'complete') {
					return ReleaseDspStatus.DISTRIBUTED;
				}
				if (normalizedTaskStatus === 'processing') {
					return ReleaseDspStatus.PROCESSING;
				}
			}
		}

		// Priority 2: Fallback to status (transfer status)
		switch (status?.toLowerCase()) {
			case 'transferred':
			case 'complete':
			case 'completed':
			case 'done':
			case 'success':
			case 'succeeded':
				return ReleaseDspStatus.DISTRIBUTED;

			case 'processing':
			case 'pending':
			case 'needs_tx':
			case 'has_tx':
			case 'in_progress':
			case 'queued':
			case 'waiting':
			case 'ok':
				return ReleaseDspStatus.PROCESSING;

			case 'not_found':
				return ReleaseDspStatus.NEVER_DISTRIBUTED;

			default:
				return ReleaseDspStatus.ISSUES;
		}
	}

	/** Sync lại release status từ DSP deliveries */
	async syncReleaseStatus(
		releaseId: string,
		dataDsp?: ReleaseExecutionResultDto[],
	) {
		const release = await this.releaseRepo
			.createQueryBuilder('release')
			.leftJoinAndSelect(
				'release.releaseDspDeliveries',
				'releaseDspDelivery',
			)
			.leftJoinAndSelect('releaseDspDelivery.dsp', 'dsp')
			.where('release.id = :releaseId', { releaseId })
			.getOne();

		if (!release) {
			throw new ResponseError({ message: 'Release not found' });
		}

		const newStatus = this.resolveReleaseStatusByDspDeliveries(
			release,
			dataDsp,
		);

		await this.releaseRepo.update(releaseId, { status: newStatus });

		// const updatedRelease = await this.releaseRepo.findOne({
		// 	where: { id: releaseId },
		// 	select: ['id', 'status'],
		// });

		return { releaseId, status: newStatus };
	}

	private resolveReleaseStatusByDspDeliveries(
		release: Release,
		dataDsp?: ReleaseExecutionResultDto[],
	): ReleaseStatus {
		const consideredDeliveries =
			release.releaseDspDeliveries?.filter((delivery) => {
				if (release.type === 'video') return true;
				if (!delivery.isSelected) return false;

				return delivery.dsp?.isActive ?? true;
			}) ?? [];

		const statuses = dataDsp
			? (consideredDeliveries
					?.filter((delivery) =>
						dataDsp.some((d) => d.dspCode === delivery.dsp?.code),
					)
					.map((delivery) => delivery.status) ?? [])
			: (consideredDeliveries.map((delivery) => delivery.status) ?? []);

		if (!statuses.length) {
			return release.status;
		}

		if (statuses.includes(ReleaseDspStatus.PROCESSING)) {
			return ReleaseStatus.PROCESSING;
		}

		const hasDistributed = statuses.includes(ReleaseDspStatus.DISTRIBUTED);
		const hasTakenDown = statuses.includes(ReleaseDspStatus.TAKEN_DOWN);
		const hasIssues = statuses.includes(ReleaseDspStatus.ISSUES);

		if (hasIssues && (hasDistributed || hasTakenDown)) {
			return ReleaseStatus.PARTIAL_DONE;
		}

		if (hasDistributed) {
			return ReleaseStatus.DISTRIBUTED;
		}

		if (hasTakenDown) {
			return ReleaseStatus.TAKEN_DOWN;
		}

		if (hasIssues) {
			return ReleaseStatus.FAILED;
		}

		if (
			statuses.every(
				(status) => status === ReleaseDspStatus.NEVER_DISTRIBUTED,
			)
		) {
			return release.status;
		}

		return release.status;
	}

	async getReleaseXml(id: string, code: string, ernVersion?: ErnVersion2) {
		const release = await this.releaseQueryService.findOneReleaseFull({
			releaseId: id,
		});

		return this.releaseDdexService.generateReleaseXml(
			release,
			code || 'spotify',
			ernVersion,
		);
	}
}
