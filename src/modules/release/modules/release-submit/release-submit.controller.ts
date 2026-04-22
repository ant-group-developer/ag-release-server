import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { ReleaseSubmitService } from './release-submit.service';

@ApiTags('Release Submits')
@Controller('release-submits')
export class ReleaseSubmitController {
	constructor(
		private readonly releaseSubmitService: ReleaseSubmitService,
	) {}

	@Post()
	async create(@Body() body: Record<string, any>) {
		const result = await this.releaseSubmitService.new(body);
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/processing')
	async processing(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseSubmitService.processing({ id });
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/waiting-action')
	async waitingAction(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseSubmitService.waitingAction({ id });
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/done')
	async done(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseSubmitService.done({ id });
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/failed')
	async failed(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.releaseSubmitService.failed({ id });
		return new ResponseSuccess({ data: result });
	}
}
