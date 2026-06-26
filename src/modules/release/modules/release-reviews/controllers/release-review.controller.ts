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
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import {
	CreateReleaseReviewDto,
	GetListReleaseReviewsDto,
	UpdateReleaseReviewDto,
} from '../dto/release-review.dto';
import { ReleaseReviewService } from '../services/release-review.service';

@ApiTags('Release Reviews')
@Controller('release-reviews')
export class ReleaseReviewController {
	constructor(private readonly service: ReleaseReviewService) {}

	@Post()
	@ApiOperation({ summary: 'Create release review' })
	async create(@Body() body: CreateReleaseReviewDto) {
		const result = await this.service.create(body);
		return AppResponseSuccess.COMMON(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list release reviews' })
	@ApiQuery({ type: GetListReleaseReviewsDto })
	async getList(@Query() query: GetListReleaseReviewsDto) {
		const result = await this.service.getList(query);
		return AppResponseSuccess.COMMON(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get release review detail' })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.service.findOne(id);
		return AppResponseSuccess.COMMON(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update release review' })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: UpdateReleaseReviewDto,
	) {
		const result = await this.service.update(id, body);
		return AppResponseSuccess.COMMON(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete release review' })
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.service.remove(id);
		return AppResponseSuccess.COMMON();
	}
}
