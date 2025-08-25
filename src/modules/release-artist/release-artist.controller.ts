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
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	ReleaseArtistMessageCodeSuccess,
	ReleaseArtistMessageError,
	ReleaseArtistMessageSuccess,
} from './constants/release-artist.constant';

import {
	CreateReleaseArtistDto,
	QueryGetListReleaseArtistDto,
	UpdateReleaseArtistDto,
} from './dto/release-artist.dto';
import { ReleaseArtist } from './entities/release-artist.entity';
import { ReleaseArtistService } from './services/release-artist.service';

@ApiTags('Release Artists')
@Controller('release-artists')
export class ReleaseArtistController {
	constructor(private readonly releaseArtistService: ReleaseArtistService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new release artist' })
	@ApiResponse({
		status: 200,
		description: ReleaseArtistMessageSuccess.CREATE,
	})
	async create(
		@Body() createReleaseArtistDto: CreateReleaseArtistDto,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.create(
			createReleaseArtistDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseArtistMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a release artist by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved release artist',
	})
	@ApiResponse({
		status: 404,
		description: ReleaseArtistMessageError.NOT_FOUND,
	})
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of release artist' })
	@ApiResponse({
		status: 200,
		description: 'List of release artist',
	})
	async getList(
		@Query() query: QueryGetListReleaseArtistDto,
	): Promise<ResponseSuccess<PageDto<ReleaseArtist>>> {
		const result = await this.releaseArtistService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a release artist by ID' })
	@ApiResponse({
		status: 200,
		description: ReleaseArtistMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 404,
		description: ReleaseArtistMessageError.NOT_FOUND,
	})
	async update(
		@Param('id') id: string,
		@Body() updateReleaseArtistDto: UpdateReleaseArtistDto,
	): Promise<ResponseSuccess<ReleaseArtist>> {
		const result = await this.releaseArtistService.update(
			id,
			updateReleaseArtistDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseArtistMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a release artist by ID' })
	@ApiResponse({
		status: 200,
		description: ReleaseArtistMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseArtistService.handleDelete(id);
		return new ResponseSuccess({
			messageCode: ReleaseArtistMessageCodeSuccess.DELETE,
		});
	}
}
