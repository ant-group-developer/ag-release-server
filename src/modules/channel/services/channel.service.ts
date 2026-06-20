import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import { LogsService } from 'src/modules/log/services/logs.services';
import { TelegramService } from 'src/modules/notification/services/notification.telegram-service';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { DataSource, In, Not, Repository } from 'typeorm';
import { ChannelException } from '../constants/channel.constant';
import {
	CreateChannelDto,
	QueryGetListChannelDto,
	UpdateChannelDto,
} from '../dto/channel.dto';
import { VevoChannelCallbackDto } from '../dto/vevo.dto';
import { ChannelHistory } from '../entities/channel-history.entity';
import { Channel } from '../entities/channel.entity';
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
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly tenantService: TenantService,
		private readonly vevoService: VevoService,

		private readonly logsService: LogsService,
		private readonly telegramService: TelegramService,
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
				module: 'channel',
				data: {
					request: { channelName: name },
					response,
				},
				message: 'Response create channel vevo',
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

	async getList(query: QueryGetListChannelDto, actorTenantId: string) {
		const onlyActorTenant = query.onlyActorTenant === true;
		const { status } = query;
		const qb = this.createDetailQuery(true);
		// Tenant thuong chi duoc xem channel cua chinh no va toan bo tenant con.
		// System tenant nhan undefined de khong ap dung bo loc tenant.
		const tenantIds = onlyActorTenant
			? undefined
			: await this.getAccessibleTenantIds(actorTenantId);

		if (query.keyword) {
			qb.andWhere('channel.name ILIKE :keyword', {
				keyword: `%${query.keyword}%`,
			});
		}

		if (status) {
			qb.andWhere('channel.status = :status', { status });
		}

		if (onlyActorTenant) {
			qb.andWhere('channel.tenantId = :actorTenantId', {
				actorTenantId,
			});
		} else if (query.tenantId) {
			this.ensureTenantAccessible(query.tenantId, tenantIds);
			qb.andWhere('channel.tenantId = :tenantId', {
				tenantId: query.tenantId,
			});
		} else if (tenantIds) {
			qb.andWhere('channel.tenantId IN (:...tenantIds)', { tenantIds });
		}

		qb.orderBy(`channel.${query.fieldOrder || 'name'}`, query.orderBy)
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
	) {
		const filter = Object.assign(new QueryGetListChannelDto(), query, {
			onlyActorTenant: true,
			status: ChannelStatus.SUCCESS,
		});

		return this.getList(filter, actorTenantId);
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
		if (!channel) throw new NotFoundException('Channel not found');
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
		const tenantIds = await this.getAccessibleTenantIds(actorTenantId);
		if (dto.tenantId !== undefined) {
			// Khong cho chuyen channel ra ngoai nhanh tenant hien tai.
			this.ensureTenantAccessible(dto.tenantId, tenantIds);
		}

		if (dto.name && dto.name !== channel.name) {
			await this.ensureNameUnique(dto.name, id);
		}

		const hasImportantChange =
			(dto.name !== undefined && dto.name !== channel.name) ||
			(dto.tenantId !== undefined && dto.tenantId !== channel.tenantId);

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
			});
		});

		return this.findOne(id, actorTenantId);
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
