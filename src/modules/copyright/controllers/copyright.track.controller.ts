import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CompareHistoryScanDto } from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@ApiTags('Bản quyền bài hát')
@Controller('tracks/:id/copyright')
export class CopyrightTrackController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	@ApiOperation({ summary: 'Quét bản quyền cho bài hát' })
	@ApiParam({ name: 'id', type: 'string', description: 'ID bài hát' })
	@ApiResponse({ status: 201, type: ResponseSuccess })
	async scanCopyright(@Param('id') id: string) {
		const result = await this.copyrightService.scanTrackCopyright({
			trackId: id,
		});
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Lấy kết quả quét bản quyền của bài hát' })
	@ApiParam({ name: 'id', type: 'string', description: 'ID bài hát' })
	@ApiResponse({ status: 200, type: ResponseSuccess })
	async getResultOfTrack(@Param('id') trackId: string) {
		const result = await this.copyrightService.getResultOfTrack(trackId);
		return new ResponseSuccess({ data: result });
	}

	@Post('compare')
	@ApiOperation({ summary: 'So sánh hai lịch sử quét bản quyền' })
	@ApiParam({ name: 'id', type: 'string', description: 'ID bài hát' })
	@ApiBody({ type: CompareHistoryScanDto })
	@ApiResponse({ status: 201, type: ResponseSuccess })
	async compareResultOfTrack(@Body() payload: CompareHistoryScanDto) {
		const result =
			await this.copyrightService.compareResultOfTrack(payload);
		return new ResponseSuccess({ data: result });
	}
}
