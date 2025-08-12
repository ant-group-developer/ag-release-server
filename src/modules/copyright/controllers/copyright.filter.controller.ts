import { Body, Controller, Post } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { CreateTrackScanStatusDto } from '../dtos/copryright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/filter')
export class CopyrightFilterController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	async handleCreateFilter(@Body() data: CreateTrackScanStatusDto) {
		const result = await this.copyrightService.handleCreateFilter(data);
		return new ResponseSuccess({ data: result });
	}
}
