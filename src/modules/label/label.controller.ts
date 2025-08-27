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
	LabelMessageCodeSuccess,
	LabelMessageSuccess,
} from './constants/label.constant';
import {
	CreateLabelDto,
	QueryGetListLabelDto,
	UpdateLabelDto,
} from './dto/label.dto';
import { Label } from './entities/label.entity';
import { LabelService } from './services/label.service';

@ApiTags('Labels')
@Controller('labels')
export class LabelController {
	constructor(private readonly labelService: LabelService) {}

	@Post()
	async create(
		@Body() createLabelDto: CreateLabelDto,
	): Promise<ResponseSuccess<Label>> {
		const result = await this.labelService.create(createLabelDto);
		return new ResponseSuccess({
			data: result,
			messageCode: LabelMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<Label>> {
		const result = await this.labelService.findOneWithCountRelation(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of labels' })
	@ApiResponse({
		status: 200,
		description: 'List of labels',
	})
	async getList(
		@Query() query: QueryGetListLabelDto,
	): Promise<ResponseSuccess<PageDto<Label>>> {
		const result = await this.labelService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateLabelDto: UpdateLabelDto,
	): Promise<ResponseSuccess<Label>> {
		const result = await this.labelService.update(id, updateLabelDto);
		return new ResponseSuccess({
			data: result,
			messageCode: LabelMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a label by ID' })
	@ApiResponse({
		status: 200,
		description: LabelMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.labelService.delete(id);
		return new ResponseSuccess({
			messageCode: LabelMessageCodeSuccess.DELETE,
		});
	}
}
