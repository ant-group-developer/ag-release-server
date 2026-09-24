import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AssetOwnershipService } from 'src/modules/asset-import/services/asset-ownership.service';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import { LogModule } from 'src/modules/log/entites/logs.entity';
import { LogsService } from 'src/modules/log/services/logs.services';
import { TelegramService } from 'src/modules/notification/services/notification.telegram-service';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { TenantUser } from 'src/modules/user/entities/tenant-user.entity';
import { TenantUserType } from 'src/modules/user/enum/user.enum';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import {
	CHANNEL_TRANSFER_MAX_RELEASES,
	ChannelException,
} from '../constants/channel.constant';
import {
	CreateChannelDto,
	QueryGetListChannelDto,
	TransferChannelTenantDto,
	UpdateChannelDto,
} from '../dto/channel.dto';
import { VevoChannelCallbackDto } from '../dto/vevo.dto';
import { ChannelHistory } from '../entities/channel-history.entity';
import { Channel } from '../entities/channel.entity';
import { UserChannel } from '../entities/user-channel.entity';
import { ChannelStatus } from '../enum/channel.enum';
import { VevoCreateChannelResponse } from '../interfaces/vevo.interface';
import { VevoService } from './vevo.service';

@Injectable()
export class ChannelService {
	private readonly logger = new Logger(ChannelService.name);

	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		@InjectRepository(ChannelHistory)
		private readonly channelHistoryRepo: Repository<ChannelHistory>,
		@InjectRepository(UserChannel)
		private readonly userChannelRepo: Repository<UserChannel>,
		@InjectRepository(TenantUser)
		private readonly tenantUserRepo: Repository<TenantUser>,
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly tenantService: TenantService,
		private readonly vevoService: VevoService,

		private readonly logsService: LogsService,
		private readonly telegramService: TelegramService,
		private readonly assetOwnershipService: AssetOwnershipService,
	) {}

	async create(dto: CreateChannelDto) {
		await this.ensureNameUnique(dto.name);

		const {
			existedOnVevoBackstage,
			name,
			tenantId,
			youtubeChannelId,
			thumbUrl,
		} = dto;

		if (!existedOnVevoBackstage) {
			const response = await this.vevoService.newChannel(name);

			this.logsService.log({
				module: LogModule.VEVO_REQUEST,
				data: {
					request: { channelName: name },
					response,
				},
				message: `[CREATE_CHANNEL] Sent request to create Vevo channel: ${name}`,
			});

			if (response.errors?.length || !response.data?.createChannel) {
				throw this.buildVevoCreateChannelError(response);
			}
		}

		const channel = await this.channelRepo.save(
			this.channelRepo.create({
				name,
				tenantId,
				youtubeChannelId: youtubeChannelId ?? null,
				thumbUrl: thumbUrl ?? null,
				status: existedOnVevoBackstage
					? ChannelStatus.SUCCESS
					: ChannelStatus.PROCESSING,
				error: null,
			}),
		);

		return channel;
	}

	async handleVevoCallback(payload: VevoChannelCallbackDto) {
		const channel = await this.channelRepo.findOne({
			where: { name: payload.channel_name },
		});

		if (channel) {
			await this.channelRepo.update(channel.id, {
				status: ChannelStatus.SUCCESS,
				error: null,
				youtubeChannelId: payload.youtube_channel_id,
			});

			return { received: true, created: false };
		}

		const createdChannel = await this.channelRepo.save(
			this.channelRepo.create({
				name: payload.channel_name,
				youtubeChannelId: payload.youtube_channel_id,
				status: ChannelStatus.SUCCESS,
				error: null,
				tenantId: null,
			}),
		);

		this.notifyChannelCreatedWithoutTenant(createdChannel).catch((error) =>
			this.logger.error(error),
		);

		return { received: true, created: true };
	}

	async getList(
		query: QueryGetListChannelDto,
		actorTenantId: string,
		userId?: string,
	) {
		const onlyActorTenant = query.onlyActorTenant === true;
		const { status } = query;
		const qb = this.createDetailQuery(true);
		// Tenant thuong chi duoc xem channel cua chinh no va toan bo tenant con.
		// System tenant nhan undefined de khong ap dung bo loc tenant.
		const tenantIds = onlyActorTenant
			? undefined
			: await this.getAccessibleTenantIds(actorTenantId);

		// 1. Phân quyền Role của User (Gom điều kiện, loại bỏ nested if)
		if (checkIsNotSystemTenant(actorTenantId) && userId) {
			const tenantUser = await this.tenantUserRepo.findOne({
				where: { userId, tenantId: actorTenantId },
			});

			if (tenantUser?.type === TenantUserType.MEMBER) {
				qb.andWhere('channel.isActive = :isActive', { isActive: true });
				qb.innerJoin(
					'user_channels',
					'uc',
					'uc.channel_id = channel.id AND uc.user_id = :userId',
					{ userId },
				);
			}
		}

		// 2. Khởi tạo các filter điều kiện tìm kiếm
		if (query.keyword) {
			qb.andWhere('channel.name ILIKE :keyword', {
				keyword: `%${query.keyword}%`,
			});
		}

		if (status) {
			qb.andWhere('channel.status = :status', { status });
		}

		if (query.isActive !== undefined) {
			qb.andWhere('channel.isActive = :isActive', {
				isActive: query.isActive,
			});
		}

		// 3. Áp dụng filter Tenant (Giữ nguyên cấu trúc if-else-if độc lập)
		if (onlyActorTenant && checkIsNotSystemTenant(actorTenantId)) {
			qb.andWhere('channel.tenantId = :actorTenantId', { actorTenantId });
		} else if (query.tenantId) {
			this.ensureTenantAccessible(query.tenantId, tenantIds);
			qb.andWhere('channel.tenantId = :tenantId', {
				tenantId: query.tenantId,
			});
		} else if (tenantIds) {
			qb.andWhere('channel.tenantId IN (:...tenantIds)', { tenantIds });
		}

		qb.orderBy(query.fieldOrder, query.orderBy)
			.skip(query.skip)
			.take(query.limit);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	async getListChannelOnlyActorTenant(
		query: QueryGetListChannelDto,
		actorTenantId: string,
		userId?: string,
	) {
		const filter = Object.assign(new QueryGetListChannelDto(), query, {
			onlyActorTenant: true,
			status: ChannelStatus.SUCCESS,
		});

		return this.getList(filter, actorTenantId, userId);
	}

	async getListSimple(query: QueryGetListChannelDto, actorTenantId: string) {
		const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
		if (query.tenantId) {
			this.ensureTenantAccessible(query.tenantId, tenantIds);
		}

		return this.channelRepo.find({
			select: {
				id: true,
				name: true,
				tenantId: true,
			},
			where: query.tenantId
				? { tenantId: query.tenantId }
				: tenantIds
					? { tenantId: In(tenantIds) }
					: undefined,
			order: { name: 'ASC' },
		});
	}

	async findOne(id: string, actorTenantId?: string) {
		const channel = await this.createDetailQuery()
			.where('channel.id = :id', { id })
			.getOne();
		if (!channel) throw ChannelException.CHANNEL_NOT_FOUND();
		if (actorTenantId) {
			const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
			this.ensureTenantAccessible(channel.tenantId, tenantIds);
		}
		return channel;
	}

	async update(
		id: string,
		dto: UpdateChannelDto,
		actorTenantId: string,
		userId: string,
	) {
		// chưa có api update bên vevo
		dto.name = undefined;
		dto.youtubeChannelId = undefined;

		// Kiem tra channel hien tai nam trong cay tenant ma nguoi dung quan ly.
		const channel = await this.findOne(id, actorTenantId);
		const tenantChanged =
			dto.tenantId !== undefined && dto.tenantId !== channel.tenantId;

		if (tenantChanged) {
			if (!dto.effectiveDate || !dto.revenueEffectiveFrom) {
				throw ChannelException.DATES_REQUIRED();
			}

			const transferDto: TransferChannelTenantDto = {
				tenantId: dto.tenantId!,
				effectiveDate: dto.effectiveDate,
				revenueEffectiveFrom: dto.revenueEffectiveFrom,
			};
			const prepared = await this.prepareTransfer(
				id,
				transferDto,
				actorTenantId,
			);
			if (prepared.blockingSharedIsrcs.length) {
				throw ChannelException.SHARED_ISRC({
					blockingSharedIsrcs: prepared.blockingSharedIsrcs,
				});
			}
			if (prepared.blockingReleases.length) {
				throw ChannelException.DATE_NOT_AFTER_CURRENT_PERIOD({
					blockingReleases: prepared.blockingReleases,
				});
			}

			const revenueEffectiveFrom =
				this.assetOwnershipService.normalizeRevenueMonth(
					transferDto.revenueEffectiveFrom,
				);

			await this.dataSource.transaction(async (manager) => {
				await this.applyPreparedTransfer(
					manager,
					id,
					transferDto,
					prepared,
					revenueEffectiveFrom,
					userId,
				);
				await manager.update(Channel, id, {
					...(dto.thumbUrl !== undefined
						? { thumbUrl: dto.thumbUrl }
						: {}),
					...(dto.isActive !== undefined
						? { isActive: dto.isActive }
						: {}),
				});
			});

			await this.dataSource.query(
				"SELECT pg_notify('clickhouse_sync_channel', 'asset_ownership_periods')",
			);

			this.logsService.log({
				module: LogModule.COMMON,
				message: `[CHANNEL_TRANSFER] ${prepared.channel.name} ${prepared.fromTenantId} -> ${transferDto.tenantId}`,
				data: {
					channelId: id,
					mode: prepared.mode,
					fromTenantId: prepared.fromTenantId,
					toTenantId: transferDto.tenantId,
					effectiveDate: transferDto.effectiveDate,
					revenueEffectiveFrom,
					transferredReleaseCount: prepared.releasesToTransfer.length,
					source: 'channel_update',
				},
			});

			return this.findOne(id, actorTenantId);
		}

		if (dto.name && dto.name !== channel.name) {
			await this.ensureNameUnique(dto.name, id);
		}

		const hasImportantChange =
			dto.name !== undefined && dto.name !== channel.name;

		// Snapshot channel cu va update phai thanh cong/that bai cung nhau.
		await this.dataSource.transaction(async (manager) => {
			if (hasImportantChange) {
				await manager.save(
					ChannelHistory,
					this.channelHistoryRepo.create({
						userId,
						channelId: channel.id,
						channel,
					}),
				);
			}

			await manager.update(Channel, id, {
				...(dto.name !== undefined ? { name: dto.name } : {}),
				...(dto.tenantId !== undefined
					? { tenantId: dto.tenantId }
					: {}),
				...(dto.youtubeChannelId !== undefined
					? { youtubeChannelId: dto.youtubeChannelId }
					: {}),
				...(dto.thumbUrl !== undefined
					? { thumbUrl: dto.thumbUrl }
					: {}),
				...(dto.isActive !== undefined
					? { isActive: dto.isActive }
					: {}),
			});
		});

		return this.findOne(id, actorTenantId);
	}

	private async applyPreparedTransfer(
		manager: EntityManager,
		id: string,
		dto: TransferChannelTenantDto,
		prepared: Awaited<ReturnType<ChannelService['prepareTransfer']>>,
		revenueEffectiveFrom: string,
		userId: string,
	) {
		await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
			`channel_transfer:${id}`,
		]);
		await manager.query("SET LOCAL statement_timeout = '60s'");

		const items = prepared.releasesToTransfer.map((release) => ({
			releaseId: release.releaseId,
			labelId: release.destLabelId,
		}));
		if (items.length) {
			await this.assetOwnershipService.transferMany(manager, {
				items,
				tenantId: dto.tenantId,
				effectiveDate: dto.effectiveDate,
				revenueEffectiveFrom,
				source: 'channel_transfer',
				actorId: userId,
				notify: false,
			});
		}

		if (prepared.mode !== 'assets_only') {
			await manager.save(
				ChannelHistory,
				this.channelHistoryRepo.create({
					userId,
					channelId: id,
					channel: prepared.channel,
					effectiveDate: dto.effectiveDate,
					revenueEffectiveFrom,
					fromTenantId: prepared.fromTenantId,
					toTenantId: dto.tenantId,
				}),
			);
			await manager.delete(UserChannel, { channelId: id });
			await manager.update(Channel, id, { tenantId: dto.tenantId });
		}
	}

	async previewTransfer(
		id: string,
		dto: TransferChannelTenantDto,
		actorTenantId: string,
	) {
		return this.prepareTransfer(id, dto, actorTenantId);
	}

	async transferTenant(
		id: string,
		dto: TransferChannelTenantDto,
		actorTenantId: string,
		userId: string,
	) {
		const prepared = await this.prepareTransfer(id, dto, actorTenantId);
		if (prepared.blockingSharedIsrcs.length) {
			throw ChannelException.SHARED_ISRC({
				blockingSharedIsrcs: prepared.blockingSharedIsrcs,
			});
		}
		if (prepared.blockingReleases.length) {
			throw ChannelException.DATE_NOT_AFTER_CURRENT_PERIOD({
				blockingReleases: prepared.blockingReleases,
			});
		}

		const revenueEffectiveFrom =
			this.assetOwnershipService.normalizeRevenueMonth(
				dto.revenueEffectiveFrom,
			);

		await this.dataSource.transaction(async (manager) => {
			await this.applyPreparedTransfer(
				manager,
				id,
				dto,
				prepared,
				revenueEffectiveFrom,
				userId,
			);
		});

		await this.dataSource.query(
			"SELECT pg_notify('clickhouse_sync_channel', 'asset_ownership_periods')",
		);

		this.logsService.log({
			module: LogModule.COMMON,
			message: `[CHANNEL_TRANSFER] ${prepared.channel.name} ${prepared.fromTenantId} -> ${dto.tenantId}`,
			data: {
				channelId: id,
				mode: prepared.mode,
				fromTenantId: prepared.fromTenantId,
				toTenantId: dto.tenantId,
				effectiveDate: dto.effectiveDate,
				revenueEffectiveFrom,
				transferredReleaseCount: prepared.releasesToTransfer.length,
			},
		});

		const channel = await this.findOne(id, actorTenantId);
		return {
			channel,
			mode: prepared.mode,
			fromTenantId: prepared.fromTenantId,
			toTenantId: dto.tenantId,
			effectiveDate: dto.effectiveDate,
			revenueEffectiveFrom,
			totalReleaseCount: prepared.totalReleaseCount,
			transferredReleaseCount: prepared.releasesToTransfer.length,
			skippedAlreadyDestCount: prepared.skippedAlreadyDestCount,
			labelClearedCount: prepared.labelsToClear.length,
			baselineCreatedCount: prepared.baselineCreatedCount,
		};
	}

	private async prepareTransfer(
		id: string,
		dto: TransferChannelTenantDto,
		actorTenantId: string,
	) {
		this.assetOwnershipService.assertDate(
			dto.effectiveDate,
			'effectiveDate',
		);
		const revenueEffectiveFrom =
			this.assetOwnershipService.normalizeRevenueMonth(
				dto.revenueEffectiveFrom,
			);

		const channel = await this.createDetailQuery()
			.where('channel.id = :id', { id })
			.getOne();
		if (!channel) throw ChannelException.CHANNEL_NOT_FOUND();

		const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
		if (channel.tenantId) {
			this.ensureTenantAccessible(channel.tenantId, tenantIds);
		}
		this.ensureTenantAccessible(dto.tenantId, tenantIds);

		const videoReleases: Array<{
			release_id: string;
			tenant_id: string;
			label_id: string | null;
			video_id: string;
			isrc: string | null;
		}> = await this.dataSource.query(
			`SELECT r.id AS release_id,
			        r.tenant_id,
			        r.label_id,
			        v.id AS video_id,
			        v.isrc
			 FROM videos v
			 INNER JOIN releases r ON r.id = v.release_id
			 WHERE v.channel_id = $1`,
			[id],
		);

		if (videoReleases.length > CHANNEL_TRANSFER_MAX_RELEASES) {
			throw ChannelException.TOO_LARGE(CHANNEL_TRANSFER_MAX_RELEASES);
		}

		const sharedIsrcs: Array<{
			isrc: string;
			channel_release_id: string;
			other_release_id: string;
			src: string;
		}> = videoReleases.length
			? await this.dataSource.query(
					`SELECT v.isrc,
					        v.release_id AS channel_release_id,
					        other.release_id AS other_release_id,
					        other.src
					 FROM videos v
					 JOIN (
					   SELECT isrc, release_id, 'track' AS src
					   FROM tracks
					   WHERE isrc IS NOT NULL AND isrc <> ''
					   UNION ALL
					   SELECT isrc, release_id, 'video' AS src
					   FROM videos
					   WHERE isrc IS NOT NULL AND isrc <> ''
					 ) other ON other.isrc = v.isrc AND other.release_id <> v.release_id
					 WHERE v.channel_id = $1
					   AND v.isrc IS NOT NULL AND v.isrc <> ''`,
					[id],
				)
			: [];

		const uniqueReleaseIds = [
			...new Set(videoReleases.map((r) => r.release_id)),
		];
		const openPeriods: Array<{
			release_id: string;
			tenant_id: string;
			label_id: string | null;
			effective_from: string;
			revenue_effective_from: string;
		}> = uniqueReleaseIds.length
			? await this.dataSource.query(
					`SELECT p.release_id, p.tenant_id, p.label_id,
					        to_char(p.effective_from, 'YYYY-MM-DD') AS effective_from,
					        to_char(p.revenue_effective_from, 'YYYY-MM-DD') AS revenue_effective_from
					 FROM asset_ownership_periods p
					 WHERE p.release_id = ANY($1::uuid[])
					   AND p.effective_to IS NULL`,
					[uniqueReleaseIds],
				)
			: [];
		const openByRelease = new Map(
			openPeriods.map((p) => [p.release_id, p]),
		);

		const destLabels = uniqueReleaseIds.length
			? await this.dataSource.query(
					`SELECT id FROM labels WHERE tenant_id = $1 AND id = ANY($2::varchar[])`,
					[
						dto.tenantId,
						[
							...new Set(
								videoReleases
									.map((r) => r.label_id)
									.filter((labelId): labelId is string =>
										Boolean(labelId),
									),
							),
						],
					],
				)
			: [];
		const destLabelSet = new Set(
			destLabels.map((row: { id: string }) => row.id),
		);

		const blockingReleases: Array<{
			releaseId: string;
			currentEffectiveFrom: string;
			currentRevenueEffectiveFrom: string;
		}> = [];
		const releasesToTransfer: Array<{
			releaseId: string;
			destLabelId: string | null;
		}> = [];
		const labelsToClear: string[] = [];
		let skippedAlreadyDestCount = 0;
		let baselineCreatedCount = 0;
		let maxCurrentEffectiveFrom = '1900-01-01';
		let maxCurrentRevenueEffectiveFrom = '1900-01-01';

		for (const releaseId of uniqueReleaseIds) {
			const row = videoReleases.find((r) => r.release_id === releaseId)!;
			const open = openByRelease.get(releaseId);
			const currentEffectiveFrom = open?.effective_from ?? '1900-01-01';
			const currentRevenueEffectiveFrom =
				open?.revenue_effective_from ?? '1900-01-01';
			if (currentEffectiveFrom > maxCurrentEffectiveFrom) {
				maxCurrentEffectiveFrom = currentEffectiveFrom;
			}
			if (currentRevenueEffectiveFrom > maxCurrentRevenueEffectiveFrom) {
				maxCurrentRevenueEffectiveFrom = currentRevenueEffectiveFrom;
			}
			if (!open) baselineCreatedCount += 1;

			const currentTenant = open?.tenant_id ?? row.tenant_id;
			const currentLabel = open?.label_id ?? row.label_id ?? null;
			const destLabelId =
				currentLabel && destLabelSet.has(currentLabel)
					? currentLabel
					: null;
			if (currentLabel && destLabelId === null) {
				labelsToClear.push(releaseId);
			}

			if (
				currentTenant === dto.tenantId &&
				currentLabel === destLabelId
			) {
				skippedAlreadyDestCount += 1;
				continue;
			}

			if (
				dto.effectiveDate <= currentEffectiveFrom ||
				revenueEffectiveFrom <= currentRevenueEffectiveFrom
			) {
				blockingReleases.push({
					releaseId,
					currentEffectiveFrom,
					currentRevenueEffectiveFrom,
				});
				continue;
			}

			releasesToTransfer.push({ releaseId, destLabelId });
		}

		const identityMatches = channel.tenantId === dto.tenantId;
		let mode: 'identity' | 'assets_only' | 'first_assign';
		if (!channel.tenantId) mode = 'first_assign';
		else if (identityMatches) mode = 'assets_only';
		else mode = 'identity';

		if (
			identityMatches &&
			releasesToTransfer.length === 0 &&
			!blockingReleases.length &&
			!sharedIsrcs.length
		) {
			throw ChannelException.ALREADY_IN_TENANT();
		}

		return {
			channel,
			mode,
			fromTenantId: channel.tenantId,
			totalReleaseCount: uniqueReleaseIds.length,
			releasesToTransfer,
			skippedAlreadyDestCount,
			labelsToClear,
			baselineCreatedCount,
			blockingReleases,
			blockingSharedIsrcs: sharedIsrcs,
			maxCurrentEffectiveFrom,
			maxCurrentRevenueEffectiveFrom,
		};
	}

	async assignUsersToChannel(
		channelId: string,
		userIds: string[],
		actorTenantId: string,
		creatorId?: string,
	) {
		const channel = await this.findOne(channelId, actorTenantId);
		const targetTenantId =
			channel.tenantId ||
			(checkIsNotSystemTenant(actorTenantId) ? actorTenantId : null);

		if (!targetTenantId) {
			throw ChannelException.TENANT_NOT_SET();
		}

		// 1. Kiểm tra danh sách User thuộc Workspace của Channel
		const tenantUsers = await this.tenantUserRepo.find({
			where: {
				tenantId: targetTenantId,
				userId: In(userIds),
			},
		});
		if (tenantUsers.length !== userIds.length) {
			throw ChannelException.USER_NOT_IN_WORKSPACE();
		}

		// 2. Lấy danh sách các user đã được gán sẵn để tránh gán trùng
		const validUserIds = tenantUsers.map((tu) => tu.userId);
		const alreadyAssigned = await this.userChannelRepo.find({
			where: { channelId, userId: In(validUserIds) },
		});

		const assignedSet = new Set(alreadyAssigned.map((uc) => uc.userId));
		const newUsersToAssign = validUserIds.filter(
			(id) => !assignedSet.has(id),
		);
		if (!newUsersToAssign.length) return;

		// 3. Tiến hành gán user
		const validCreatorId =
			creatorId && checkIsNotSystemTenant(creatorId) ? creatorId : null;
		const records = newUsersToAssign.map((userId) =>
			this.userChannelRepo.create({
				channelId,
				userId,
				tenantId: targetTenantId,
				creatorId: validCreatorId,
			}),
		);

		await this.userChannelRepo.save(records);
	}

	async removeUserFromChannel(id: string, actorTenantId: string) {
		// 1. Tìm thông tin record định xoá
		const userChannel = await this.userChannelRepo.findOne({
			where: { id },
		});
		if (!userChannel) return;

		// 2. Lấy danh sách quyền và đối chiếu với tenantId của cái userChannel kia
		const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
		this.ensureTenantAccessible(userChannel.tenantId, tenantIds);

		// 3. Xoá an toàn
		await this.userChannelRepo.delete({ id });
	}

	async getUsersInChannel(channelId: string, actorTenantId: string) {
		await this.findOne(channelId, actorTenantId);

		const assignedUserChannels = await this.userChannelRepo.find({
			where: { channelId },
			relations: { user: true },
		});

		return assignedUserChannels
			.filter((uc) => uc.user)
			.map((uc) => ({
				...uc,
				user: {
					id: uc.user.id,
					name: uc.user.name,
					email: uc.user.email,
					avatar: uc.user.avatar,
					type: uc.user.type,
					isActive: uc.user.isActive,
					lastLogin: uc.user.lastLogin,
					lastActive: uc.user.lastActive,
				},
			}));
	}

	async getUserChannels(userId: string, actorTenantId: string) {
		const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
		const userChannels = await this.userChannelRepo.find({
			where: {
				userId,
				...(tenantIds ? { tenantId: In(tenantIds) } : {}),
			},
			relations: { channel: true },
		});
		return userChannels.filter((uc) => uc.channel && uc.channel.isActive);
	}

	async remove(id: string, actorTenantId: string) {
		const channel = await this.findOne(id, actorTenantId);
		await this.channelRepo.remove(channel);
		return { success: true };
	}

	private async getAccessibleTenantIds(actorTenantId: string) {
		// System tenant co quyen tren tat ca tenant; tenant thuong co quyen de quy
		// tren chinh no, con, chau va cac cap ben duoi.
		if (!checkIsNotSystemTenant(actorTenantId)) return undefined;
		return this.tenantService.getDescendantIds(actorTenantId);
	}

	/** Dam bao tenant so huu channel nam trong pham vi actor duoc quan ly. */
	private ensureTenantAccessible(
		tenantId: string | null,
		accessibleTenantIds?: string[],
	) {
		if (
			accessibleTenantIds &&
			(!tenantId || !accessibleTenantIds.includes(tenantId))
		) {
			throw new ResponseError(AuthMessages.FORBIDDEN);
		}
	}

	private async ensureNameUnique(name: string, idIgnore?: string) {
		const exists = await this.channelRepo.findOne({
			where: {
				name,
				...(idIgnore ? { id: Not(idIgnore) } : {}),
			},
		});

		if (exists) {
			throw ChannelException.ALREADY_EXISTS();
		}
	}

	private createDetailQuery(includeHistories = false) {
		const qb = this.channelRepo
			.createQueryBuilder('channel')
			.leftJoin('channel.tenant', 'tenant')
			.addSelect([
				'tenant.id',
				'tenant.name',
				'tenant.title',
				'tenant.logo',
			]);

		if (includeHistories) {
			qb.leftJoinAndSelect('channel.histories', 'history').addOrderBy(
				'history.createdAt',
				'DESC',
			);
		}

		return qb;
	}

	private buildVevoCreateChannelError(response: VevoCreateChannelResponse) {
		const firstError = response.errors?.[0];
		const message =
			firstError?.extensions?.message ||
			firstError?.message ||
			'Vevo channel creation failed';
		const code = firstError?.extensions?.code;

		if (code === 'duplicate-channel') {
			return ChannelException.DUPLICATE_CHANNEL_ON_VEVO(response);
		}

		if (code === 'invalid-channel') {
			return ChannelException.CHANNEL_CREATE_REQUEST_EXISTS_ON_VEVO(
				response,
			);
		}

		return ChannelException.VEVO_CREATE_FAILED(
			message,
			response,
			firstError?.extensions?.status || 400,
		);
	}

	private async notifyChannelCreatedWithoutTenant(channel: Channel) {
		await this.telegramService.sendToDev(
			[
				'[VEVO] Channel added without tenant',
				'Vevo callback added a channel successfully, but tenant_id is not set.',
				`Channel name: ${channel.name}`,
				`YouTube channel ID: ${channel.youtubeChannelId || '-'}`,
				`Channel ID: ${channel.id}`,
			].join('\n'),
		);
	}
}
