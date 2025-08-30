import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import {
	CreateAlbumFormatDto,
	QueryGetListAlbumFormatDto,
	UpdateAlbumFormatDto,
} from './dto/album-format.dto';
import { AlbumFormat } from './entities/album-format.entity';
import { AlbumFormatService } from './services/album-format.service';

@ApiTags('Album Formats')
@Controller('album-formats')
export class AlbumFormatController {
	constructor(private readonly albumFormatService: AlbumFormatService) {}

	@SystemAdminOnly()
	@Post()
	@ApiOperation({ summary: 'Create a new album format' })
	@ApiResponse({
		status: 200,
		description: 'Album format created successfully',
	})
	async create(
		@Body() createAlbumFormatDto: CreateAlbumFormatDto,
	): Promise<ResponseSuccess<AlbumFormat>> {
		const result =
			await this.albumFormatService.create(createAlbumFormatDto);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of album formats' })
	@ApiResponse({ status: 200, description: 'List of album formats' })
	async getList(@Query() query: QueryGetListAlbumFormatDto) {
		const result = await this.albumFormatService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	@ApiOperation({ summary: 'Get a list of album formats' })
	@ApiResponse({ status: 200, description: 'List of album formats' })
	async getListSimple() {
		const result = await this.albumFormatService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get album format by ID' })
	@ApiResponse({
		status: 200,
		description: 'Album format found successfully',
	})
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<AlbumFormat>> {
		const result = await this.albumFormatService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	@ApiOperation({ summary: 'Update album format by ID' })
	@ApiResponse({
		status: 200,
		description: 'Album format updated successfully',
	})
	async update(
		@Param('id') id: string,
		@Body() updateAlbumFormatDto: UpdateAlbumFormatDto,
	): Promise<ResponseSuccess<AlbumFormat>> {
		const result = await this.albumFormatService.update(
			id,
			updateAlbumFormatDto,
		);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Delete(':id')
	@ApiOperation({ summary: 'Delete album format by ID' })
	@ApiResponse({
		status: 200,
		description: 'Album format deleted successfully',
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.albumFormatService.delete(id);
		return new ResponseSuccess({ messageCode: 'Album format deleted' });
	}
}
