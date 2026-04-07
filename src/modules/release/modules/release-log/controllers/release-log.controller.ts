import { Controller, Get, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { GetListReleaseLogDto } from '../dto/release-log.dto';
import { ReleaseLogService } from '../services/release-log.service';

@Controller('release-logs')
export class ReleaseLogController {
	constructor(private readonly releaseLogService: ReleaseLogService) {}

	@Get()
	async findAll(@Query() query: GetListReleaseLogDto) {
		const data = await this.releaseLogService.findAll(query);
		return new ResponseSuccess({ data });
	}
}
