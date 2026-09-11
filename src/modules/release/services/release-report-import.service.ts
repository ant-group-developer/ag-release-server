import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { ArtistSource } from 'src/modules/artist/enum/artist.enum';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { VideoArtist } from 'src/modules/video-artist/entities/video-artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { buildEquivalentUpcs, normalizeUpc } from 'src/utils/upc.util';
import { stringToCode } from 'src/utils/util';
import { DataSource, EntityManager, ILike, In, Repository } from 'typeorm';
import { AssetOwnershipService } from '../../asset-import/services/asset-ownership.service';
import { Release } from '../entities/release.entity';

export const REPORT_IMPORT_FALLBACK_TENANT_ID =
	'7c2358a0-1a38-4a10-b806-a1531ef71b0c';
export const REPORT_IMPORT_FALLBACK_LABEL_ID = 'G4_9DtvlmL';

// Có tenantId: tìm label theo ID rồi tên trong tenant; chưa có thì tạo mới.
// Không có tenantId: tìm label theo ID rồi tên và lấy tenantId từ label.
// Không xác định được tenant/label thì dùng fallback ANT MUSIC LLC + AMG.
export interface ReleaseReportImportInput {
	upc: string;

	tenantId?: string;

	labelName?: string;

	labelId?: string;

	title: string;

	artistName?: string;

	tracks: {
		title: string;

		isrc: string;
	}[];

	importSourceType?: string;

	importParserCode?: string;

	importFileName?: string;

	importJobId?: string;

	importedBy?: string;
}

@Injectable()
export class ReleaseReportImportService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly dataSource: DataSource,
		private readonly assetOwnershipService: AssetOwnershipService,
	) {}

	async importRelease(input: ReleaseReportImportInput): Promise<Release> {
		input = { ...input, upc: normalizeUpc(input.upc) };
		const equivalentUpcs = buildEquivalentUpcs(input.upc);
		// Import theo UPC là idempotent: release đã tồn tại thì không ghi đè
		// metadata hoặc tạo thêm artist/track từ report.
		const existingRelease = await this.releaseRepo.findOne({
			where: { upc: In(equivalentUpcs) },
		});
		if (existingRelease) {
			await this.ensureInitialOwnership(
				existingRelease,
				input.importedBy,
			);
			return existingRelease;
		}

		// Nếu bất kỳ ISRC nào đã tồn tại, bỏ qua toàn bộ report và trả về
		// release đang sở hữu track đó để không tạo dữ liệu trùng.
		const existingReleaseByIsrc = await this.findReleaseByExistingIsrc(
			this.dataSource.manager,
			input,
		);
		if (existingReleaseByIsrc) {
			await this.ensureInitialOwnership(
				existingReleaseByIsrc,
				input.importedBy,
			);
			return existingReleaseByIsrc;
		}

		return this.dataSource.transaction(async (manager) => {
			// Kiểm tra lại trong transaction để giảm khả năng tạo trùng khi
			// nhiều report cùng UPC được xử lý gần như đồng thời.
			const releaseInTransaction = await manager.findOne(Release, {
				where: { upc: In(equivalentUpcs) },
			});
			if (releaseInTransaction) {
				await this.recordInitialOwnership(
					manager,
					releaseInTransaction,
					input.importedBy,
				);
				return releaseInTransaction;
			}

			const releaseByIsrcInTransaction =
				await this.findReleaseByExistingIsrc(manager, input);
			if (releaseByIsrcInTransaction) {
				await this.recordInitialOwnership(
					manager,
					releaseByIsrcInTransaction,
					input.importedBy,
				);
				return releaseByIsrcInTransaction;
			}

			// Resolve tenant + label theo input; chỉ dùng fallback khi không thể
			// xác định ownership từ tenant hoặc label được truyền vào.
			const { tenantId, label } = await this.resolveOwnership(
				manager,
				input,
			);

			// Dùng lại artist cùng tên nếu đã có; chỉ artist mới được tạo bởi
			// report mới mang cờ isImportedFromReport.
			let artist: Artist | null = null;
			if (input.artistName && input.artistName.trim()) {
				artist = await this.findOrCreateArtist(
					manager,
					input.artistName,
				);
			}

			// Release và toàn bộ dữ liệu quan hệ được tạo trong cùng transaction
			// để tránh dữ liệu import dở dang khi một bước phía sau thất bại.
			const release = await manager.save(
				Release,
				manager.create(Release, {
					upc: input.upc,
					title: input.title,
					labelId: label.id,
					tenantId,
					isImportedFromReport: true,
					importSourceType: input.importSourceType || null,
					importParserCode: input.importParserCode || null,
					importFileName: input.importFileName || null,
					importJobId: input.importJobId || null,
				}),
			);

			// Artist chính của report được gắn ở cấp release và tự động kế thừa
			// xuống các track được tạo bên dưới.
			let releaseArtist: ReleaseArtist | null = null;
			if (artist) {
				releaseArtist = await manager.save(
					ReleaseArtist,
					manager.create(ReleaseArtist, {
						releaseId: release.id,
						artistId: artist.id,
						addArtistToTracks: true,
						isImportedFromReport: true,
					}),
				);
			}

			// Giữ nguyên thứ tự track trong report, bắt đầu từ order = 1.
			const tracks = await manager.save(
				Track,
				input.tracks.map((track, index) =>
					manager.create(Track, {
						releaseId: release.id,
						title: track.title,
						isrc: track.isrc,
						order: index + 1,
						copyArtistsFromRelease: true,
						isImportedFromReport: true,
						importSourceType: input.importSourceType || null,
						importParserCode: input.importParserCode || null,
						importFileName: input.importFileName || null,
						importJobId: input.importJobId || null,
					}),
				),
			);

			await this.recordInitialOwnership(
				manager,
				release,
				input.importedBy,
			);

			// Liên kết cùng artist chính với từng track và tham chiếu quan hệ
			// release_artist để các thao tác đồng bộ artist sau này hoạt động đúng.
			if (artist && releaseArtist) {
				await manager.save(
					TrackArtist,
					tracks.map((track) =>
						manager.create(TrackArtist, {
							trackId: track.id,
							artistId: artist.id,
							releaseArtistId: releaseArtist.id,
							isFromReleaseAction: true,
							isImportedFromReport: true,
						}),
					),
				);
			}

			return release;
		});
	}

	private async ensureInitialOwnership(
		release: Release,
		actorId?: string,
	): Promise<void> {
		if (!release.tenantId) return;
		await this.dataSource.transaction((manager) =>
			this.recordInitialOwnership(manager, release, actorId),
		);
	}

	private async recordInitialOwnership(
		manager: EntityManager,
		release: Release,
		actorId?: string,
	): Promise<void> {
		if (!release.tenantId) return;
		await this.assetOwnershipService.recordInitialOwnership(manager, {
			releaseId: release.id,
			tenantId: release.tenantId,
			labelId: release.labelId ?? null,
			effectiveDate: '1900-01-01',
			revenueEffectiveFrom: '1900-01-01',
			actorId: actorId ?? null,
			notify: true,
		});
	}

	private async findReleaseByExistingIsrc(
		manager: EntityManager,
		input: ReleaseReportImportInput,
	): Promise<Release | null> {
		const isrcs = [
			...new Set(
				input.tracks
					.map((track) => track.isrc?.trim())
					.filter((isrc): isrc is string => Boolean(isrc)),
			),
		];
		if (!isrcs.length) return null;

		const existingTrack = await manager.findOne(Track, {
			where: { isrc: In(isrcs) },
			order: { createdAt: 'ASC' },
		});
		if (!existingTrack) return null;

		return manager.findOne(Release, {
			where: { id: existingTrack.releaseId },
		});
	}

	private async resolveOwnership(
		manager: EntityManager,
		input: ReleaseReportImportInput,
	): Promise<{ tenantId: string; label: Label }> {
		if (input.tenantId) {
			const tenantExists = await manager.exists(Tenant, {
				where: { id: input.tenantId },
			});
			if (!tenantExists) {
				return this.getFallbackOwnership(manager);
			}

			const label = await this.findLabel(manager, input, input.tenantId);
			if (label) {
				return {
					tenantId: input.tenantId,
					label,
				};
			}

			const labelName = input.labelName?.trim();
			if (labelName) {
				const newLabel = await this.createLabel(
					manager,
					labelName,
					input.tenantId,
				);
				return {
					tenantId: input.tenantId,
					label: newLabel,
				};
			}

			return this.getFallbackOwnership(manager);
		}

		const label = await this.findLabel(manager, input);
		if (label) return { tenantId: label.tenantId, label };

		return this.getFallbackOwnership(manager);
	}

	private async findLabel(
		manager: EntityManager,
		input: ReleaseReportImportInput,
		tenantId?: string,
	): Promise<Label | null> {
		if (input.labelId) {
			const label = await manager.findOne(Label, {
				where: {
					id: input.labelId,
					...(tenantId ? { tenantId } : {}),
				},
			});
			if (label) return label;
		}

		const name = input.labelName?.trim();
		if (!name) return null;

		return manager.findOne(Label, {
			where: {
				name: ILike(name),
				...(tenantId ? { tenantId } : {}),
			},
			order: { createdAt: 'ASC' },
		});
	}

	private async createLabel(
		manager: EntityManager,
		name: string,
		tenantId: string,
	): Promise<Label> {
		const baseCode = stringToCode(name) || `REPORT_${nanoid(6)}`;
		let code = baseCode;

		while (
			await manager.exists(Label, {
				where: { code, tenantId },
			})
		) {
			code = `${baseCode}_${nanoid(6)}`;
		}

		return manager.save(
			Label,
			manager.create(Label, {
				name,
				code,
				tenantId,
				isImportedFromReport: true,
			}),
		);
	}

	private async getFallbackOwnership(
		manager: EntityManager,
	): Promise<{ tenantId: string; label: Label }> {
		const [tenantExists, label] = await Promise.all([
			manager.exists(Tenant, {
				where: { id: REPORT_IMPORT_FALLBACK_TENANT_ID },
			}),
			manager.findOne(Label, {
				where: {
					id: REPORT_IMPORT_FALLBACK_LABEL_ID,
					tenantId: REPORT_IMPORT_FALLBACK_TENANT_ID,
				},
			}),
		]);

		if (!tenantExists) {
			throw new NotFoundException(
				`Fallback tenant "${REPORT_IMPORT_FALLBACK_TENANT_ID}" was not found`,
			);
		}

		if (!label) {
			throw new NotFoundException(
				`Fallback label "${REPORT_IMPORT_FALLBACK_LABEL_ID}" was not found in fallback tenant`,
			);
		}

		return {
			tenantId: REPORT_IMPORT_FALLBACK_TENANT_ID,
			label,
		};
	}

	private async findOrCreateArtist(
		manager: EntityManager,
		artistName: string,
	): Promise<Artist> {
		const name = artistName.trim();
		const existingArtist = await manager.findOne(Artist, {
			where: { name: ILike(name) },
			order: { createdAt: 'ASC' },
		});
		if (existingArtist) return existingArtist;

		return manager.save(
			Artist,
			manager.create(Artist, {
				name,
				code: nanoid(10),
				artistSource: ArtistSource.ANT_MUSIC,
				isImportedFromReport: true,
			}),
		);
	}

	async importVideoRelease(
		input: ReleaseReportImportInput,
	): Promise<Release> {
		input = { ...input, upc: normalizeUpc(input.upc) };
		const equivalentUpcs = buildEquivalentUpcs(input.upc);

		const existingRelease = await this.releaseRepo.findOne({
			where: { upc: In(equivalentUpcs), type: 'video' },
		});
		if (existingRelease) {
			await this.ensureInitialOwnership(
				existingRelease,
				input.importedBy,
			);
			return existingRelease;
		}

		const existingReleaseByIsrc = await this.findVideoReleaseByExistingIsrc(
			this.dataSource.manager,
			input,
		);
		if (existingReleaseByIsrc) {
			await this.ensureInitialOwnership(
				existingReleaseByIsrc,
				input.importedBy,
			);
			return existingReleaseByIsrc;
		}

		return this.dataSource.transaction(async (manager) => {
			const releaseInTransaction = await manager.findOne(Release, {
				where: { upc: In(equivalentUpcs), type: 'video' },
			});
			if (releaseInTransaction) {
				await this.recordInitialOwnership(
					manager,
					releaseInTransaction,
					input.importedBy,
				);
				return releaseInTransaction;
			}

			const releaseByIsrcInTransaction =
				await this.findVideoReleaseByExistingIsrc(manager, input);
			if (releaseByIsrcInTransaction) {
				await this.recordInitialOwnership(
					manager,
					releaseByIsrcInTransaction,
					input.importedBy,
				);
				return releaseByIsrcInTransaction;
			}

			const { tenantId, label } = await this.resolveOwnership(
				manager,
				input,
			);

			let artist: Artist | null = null;
			if (input.artistName && input.artistName.trim()) {
				artist = await this.findOrCreateArtist(
					manager,
					input.artistName,
				);
			}

			const release = await manager.save(
				Release,
				manager.create(Release, {
					upc: input.upc,
					title: input.title,
					type: 'video',
					labelId: label.id,
					tenantId,
					isImportedFromReport: true,
					importSourceType: input.importSourceType || null,
					importParserCode: input.importParserCode || null,
					importFileName: input.importFileName || null,
					importJobId: input.importJobId || null,
				}),
			);

			let releaseArtist: ReleaseArtist | null = null;
			if (artist) {
				releaseArtist = await manager.save(
					ReleaseArtist,
					manager.create(ReleaseArtist, {
						releaseId: release.id,
						artistId: artist.id,
						addArtistToTracks: true,
						isImportedFromReport: true,
					}),
				);
			}

			// Save 1:1 Video entity
			const video = await manager.save(
				Video,
				manager.create(Video, {
					releaseId: release.id,
					isrc: input.tracks[0]?.isrc || null,
				}),
			);

			await this.recordInitialOwnership(
				manager,
				release,
				input.importedBy,
			);

			if (artist) {
				await manager.save(
					VideoArtist,
					manager.create(VideoArtist, {
						videoId: video.id,
						artistId: artist.id,
					}),
				);
			}

			return release;
		});
	}

	private async findVideoReleaseByExistingIsrc(
		manager: EntityManager,
		input: ReleaseReportImportInput,
	): Promise<Release | null> {
		const isrcs = [
			...new Set(
				input.tracks
					.map((track) => track.isrc?.trim())
					.filter((isrc): isrc is string => Boolean(isrc)),
			),
		];
		if (!isrcs.length) return null;

		const existingVideo = await manager.findOne(Video, {
			where: { isrc: In(isrcs) },
			order: { createdAt: 'ASC' },
		});
		if (!existingVideo) return null;

		return manager.findOne(Release, {
			where: { id: existingVideo.releaseId },
		});
	}
}
