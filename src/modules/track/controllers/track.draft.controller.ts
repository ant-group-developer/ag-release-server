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
import { ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { TrackMessageCodeSuccess } from '../constants/track.constant';

import {
	BulkCreateTrackDraft,
	BulkUpdateTrackDraft,
	UpdateTrackDraftDto,
	UpdateTrackPolicyDto,
} from '../dto/track.draft.dto';
import { BulkDeleteTracksDto, QueryGetListTrackDto } from '../dto/track.dto';
import { ITrackDraft } from '../interfaces/track.interface';
import { TrackDraftService } from '../services/track.draft.service';

@ApiTags('Tracks Draft')
@Controller('tracks/draft')
export class TrackDraftController {
	constructor(private readonly trackDraftService: TrackDraftService) {}

	@Get('policy')
	async getListWithPolicy(@Query() query: QueryGetListTrackDto) {
		const result = await this.trackDraftService.getListWithPolicy(query);
		return new ResponseSuccess({ data: result });
	}

	//
	@Post('policy')
	async createTrackPolicies() {
		const result = await this.trackDraftService.createTrackPolicies();
		return new ResponseSuccess({ data: result });
	}

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

	@Get(':id/track-policies')
	async getTrackPolicies(@Param('id') id: string) {
		const result = await this.trackDraftService.getTrackPolicies({
			trackId: id,
		});
		return new ResponseSuccess({ data: result });
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

	@Put(':id/track-policies/:trackPolicyId')
	async updateTrackPolicy(
		@Param('trackPolicyId', ParseUUIDPipe) trackPolicyId: string,
		@Body() data: UpdateTrackPolicyDto,
	) {
		const result = await this.trackDraftService.updateTrackPolicy({
			trackPolicyId,
			data,
		});

		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.trackDraftService.handleDelete(id);
		return new ResponseSuccess({
			messageCode: TrackMessageCodeSuccess.DELETE,
		});
	}

	@Post('bulk-delete')
	async bulkDelete(@Body() data: BulkDeleteTracksDto) {
		const result = await this.trackDraftService.bulkDelete(data);
		return new ResponseSuccess({ ...result });
	}
}
