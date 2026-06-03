import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { ILike, Not, Repository } from 'typeorm';
import {
	CreateChannelDto,
	QueryGetListChannelDto,
	UpdateChannelDto,
} from './dto/channel.dto';
import { Channel } from './entities/channel.entity';

@Injectable()
export class ChannelService {
	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
	) {}

	async create(dto: CreateChannelDto) {
		await this.ensureNameUnique(dto.name);
		return this.channelRepo.save(this.channelRepo.create(dto));
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
}
