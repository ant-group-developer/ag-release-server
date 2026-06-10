import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { VevoChannelCallbackDto } from 'src/modules/partners-api/vevo/dtos/vevo.dto';
import { VevoService } from 'src/modules/partners-api/vevo/services/vevo.service';
import { ILike, Not, Repository } from 'typeorm';
import {
	CreateChannelDto,
	QueryGetListChannelDto,
	UpdateChannelDto,
} from './dto/channel.dto';
import { Channel } from './entities/channel.entity';
import { ChannelStatus } from './enum/channel.enum';

@Injectable()
export class ChannelService {
	private readonly logger = new Logger(ChannelService.name);

	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		private readonly vevoService: VevoService,
	) {}

	async create(dto: CreateChannelDto) {
		await this.ensureNameUnique(dto.name);

		const channel = await this.channelRepo.save(
			this.channelRepo.create({
				...dto,
				status: ChannelStatus.PROCESSING,
				error: null,
			}),
		);

		this.processVevoChannel(channel.id, channel.name).catch((error) => {
			this.logger.error(
				`Unexpected Vevo channel processing error for ${channel.name}: ${this.getErrorMessage(error)}`,
			);
		});

		return channel;
	}

	async handleVevoCallback(payload: VevoChannelCallbackDto) {
		const result = await this.channelRepo.update(
			{ name: payload.channel_name },
			{
				status: ChannelStatus.SUCCESS,
				error: null,
			},
		);

		if (!result.affected) {
			this.logger.warn(
				`Channel not found for Vevo callback: ${payload.channel_name}`,
			);
		}

		return { received: true };
	}

	async getList(query: QueryGetListChannelDto) {
		const [items, totalItems] = await this.channelRepo.findAndCount({
			where: query.keyword
				? { name: ILike(`%${query.keyword}%`) }
				: undefined,
			order: { [query.fieldOrder || 'name']: query.orderBy },
			skip: query.skip,
			take: query.limit,
		});

		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	async getListSimple() {
		return this.channelRepo.find({
			select: {
				id: true,
				name: true,
			},
			order: { name: 'ASC' },
		});
	}

	async findOne(id: string) {
		const channel = await this.channelRepo.findOne({ where: { id } });
		if (!channel) throw new NotFoundException('Channel not found');
		return channel;
	}

	async update(id: string, dto: UpdateChannelDto) {
		const channel = await this.findOne(id);
		if (dto.name && dto.name !== channel.name) {
			await this.ensureNameUnique(dto.name, id);
		}

		Object.assign(channel, dto);
		return this.channelRepo.save(channel);
	}

	async remove(id: string) {
		const channel = await this.findOne(id);
		await this.channelRepo.remove(channel);
		return { success: true };
	}

	private async ensureNameUnique(name: string, idIgnore?: string) {
		const exists = await this.channelRepo.findOne({
			where: {
				name,
				...(idIgnore ? { id: Not(idIgnore) } : {}),
			},
		});

		if (exists) {
			throw new ConflictException('Channel name already exists');
		}
	}

	private async processVevoChannel(channelId: string, channelName: string) {
		try {
			await this.vevoService.createChannel({ channelName });
		} catch (error) {
			const message = this.getErrorMessage(error);

			await this.channelRepo.update(channelId, {
				status: ChannelStatus.FAILED,
				error: message,
			});

			this.logger.error(
				`Vevo channel request failed for ${channelName}: ${message}`,
			);
		}
	}

	private getErrorMessage(error: unknown) {
		if (error instanceof Error) return error.message;
		if (typeof error === 'string') return error;

		try {
			return JSON.stringify(error);
		} catch {
			return 'Unknown Vevo channel creation error';
		}
	}
}
