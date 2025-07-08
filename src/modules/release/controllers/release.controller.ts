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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	ReleaseMessageCodeSuccess,
	ReleaseMessageError,
	ReleaseMessageSuccess,
} from '../constants/release.constant';

import {
	QueryGetListReleaseDto,
	SubmitCreateReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import {
	IRelease,
	IReleaseNonDraft,
	IReleaseWithCoverArt,
} from '../interfaces/release.interface';
import { ReleaseService } from '../services/release.service';

@ApiTags('Releases')
@Controller('releases')
export class ReleaseController {
	constructor(private readonly releaseService: ReleaseService) {}

	// @Post()
	// @ApiOperation({ summary: 'Create a new release' })
	// @ApiResponse({
	// 	status: 200,
	// 	description: ReleaseMessageSuccess.CREATE,
	// })
	// @ApiResponse({
	// 	status: 400,
	// 	description: ReleaseMessageError.PRIMARY_GENRE_NOT_FOUND,
	// })
	// async create(
	// 	@Body() createReleaseDto: CreateReleaseDto,
	// ): Promise<ResponseSuccess<Release>> {
	// 	const result = await this.releaseService.create(createReleaseDto);
	// 	return new ResponseSuccess({
	// 		data: result,
	// 		messageCode: ReleaseMessageCodeSuccess.CREATE,
	// 	});
	// }

	@Post(':id/submit')
	async submit(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: SubmitCreateReleaseDto,
	): Promise<ResponseSuccess<IReleaseNonDraft>> {
		const result = await this.releaseService.submit(id, data);

		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a release by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved release',
	})
	@ApiResponse({
		status: 404,
		description: ReleaseMessageError.NOT_FOUND,
	})
	async getDetail(
		@Param('id') id: string,
	): Promise<ResponseSuccess<IReleaseWithCoverArt>> {
		const result = await this.releaseService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of releases' })
	@ApiResponse({
		status: 200,
		description: 'List of releases',
	})
	async getList(
		@Query() query: QueryGetListReleaseDto,
	): Promise<ResponseSuccess<PageDto<IReleaseWithCoverArt>>> {
		const result = await this.releaseService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a release by ID' })
	@ApiResponse({
		status: 200,
		description: ReleaseMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 404,
		description: ReleaseMessageError.NOT_FOUND,
	})
	@ApiResponse({
		status: 400,
		description: ReleaseMessageError.PRIMARY_GENRE_NOT_FOUND,
	})
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateReleaseDto: UpdateReleaseDto,
	): Promise<ResponseSuccess<IRelease>> {
		const result = await this.releaseService.update(id, updateReleaseDto);
		return new ResponseSuccess({
			data: result,
			messageCode: ReleaseMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a release by ID' })
	@ApiResponse({
		status: 200,
		description: ReleaseMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.releaseService.remove(id);
		return new ResponseSuccess({
			messageCode: ReleaseMessageCodeSuccess.DELETE,
		});
	}
}
