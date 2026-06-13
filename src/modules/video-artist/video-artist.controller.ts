import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { VideoArtistMessageCodeSuccess } from './constants/video-artist.constant';
import {
	BulkCreateVideoArtistDto,
	CreateVideoArtistDto,
	QueryGetListVideoArtistDto,
	UpdateVideoArtistDto,
} from './dto/video-artist.dto';
import { VideoArtist } from './entities/video-artist.entity';
import { VideoArtistService } from './services/video-artist.service';

@ApiTags('Video Artists')
@Controller('video-artists')
export class VideoArtistController {
	constructor(private readonly videoArtistService: VideoArtistService) {}

	@Post()
	async create(
		@Body() dto: CreateVideoArtistDto,
	): Promise<ResponseSuccess<VideoArtist | VideoArtist[]>> {
		const result = await this.videoArtistService.create(dto);
		return new ResponseSuccess({
			data: result,
			messageCode: VideoArtistMessageCodeSuccess.CREATE,
		});
	}

	@Post('bulk')
	async bulkCreate(
		@Body() dto: BulkCreateVideoArtistDto,
	): Promise<ResponseSuccess<VideoArtist | VideoArtist[]>> {
		const result = await this.videoArtistService.bulkCreate(dto);
		return new ResponseSuccess({
			data: result,
			messageCode: VideoArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<VideoArtist>> {
		const result = await this.videoArtistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListVideoArtistDto,
	): Promise<ResponseSuccess<PageDto<VideoArtist>>> {
		const result = await this.videoArtistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateVideoArtistDto,
	): Promise<ResponseSuccess<VideoArtist>> {
		const result = await this.videoArtistService.update(id, dto);
		return new ResponseSuccess({
			data: result,
			messageCode: VideoArtistMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.videoArtistService.delete(id);
		return new ResponseSuccess({
			messageCode: VideoArtistMessageCodeSuccess.DELETE,
		});
	}
}
