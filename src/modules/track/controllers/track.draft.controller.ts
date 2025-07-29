import { Body, Controller, Delete, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { TrackMessageCodeSuccess } from '../constants/track.constant';

import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	UpdateTrackDraftDto,
} from '../dto/track.draft.dto';
import { ITrackDraft } from '../interfaces/track.interface';
import { TrackDraftService } from '../services/track.draft.service';

@ApiTags('Tracks Draft')
@Controller('tracks/draft')
export class TrackDraftController {
	constructor(private readonly trackDraftService: TrackDraftService) {}

	@Post('bulk')
	async bulkCreate(
		@Body() data: BulkCreateTrackDraft,
	): Promise<ResponseSuccess<ITrackDraft[]>> {
		const result = await this.trackDraftService.bulkCreate(data);

		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.CREATE,
		});
	}

	@Put('bulk')
	async bulkUpdate(
		@Body() data: BulkUpdateTrackDraft,
	): Promise<ResponseSuccess<ITrackDraft[]>> {
		const result = await this.trackDraftService.bulkUpdate(data);

		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.CREATE,
		});
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() data: UpdateTrackDraftDto,
	): Promise<ResponseSuccess<ITrackDraft>> {
		const result = await this.trackDraftService.update(id, data);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.trackDraftService.mainDelete(id);
		return new ResponseSuccess({
			messageCode: TrackMessageCodeSuccess.DELETE,
		});
	}
}
