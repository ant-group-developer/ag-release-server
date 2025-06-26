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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
import {
	CreateLabelDto,
	QueryGetListLabelDto,
	UpdateLabelDto,
} from './dto/label.dto';
import { Label } from './entities/label.entity';
import { LabelService } from './label.service';

@Controller('Label')
export class LabelController {
	constructor(private readonly labelService: LabelService) {}

	@Post()
	async create(
		@Body() createLabelDto: CreateLabelDto,
	): Promise<ResponseSuccessDto<Label>> {
		const result = await this.labelService.create(createLabelDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccessDto<Label>> {
		const result = await this.labelService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListLabelDto,
	): Promise<ResponseSuccessDto<PageDto<Label>>> {
		const result = await this.labelService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateLabelDto: UpdateLabelDto,
	): Promise<Label> {
		return await this.labelService.update(id, updateLabelDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.labelService.remove(id);
	}
}
