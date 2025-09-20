import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { TrackMessageCodeSuccess } from '../constants/track.constant';

import { Request } from 'express';
import { AuthMessages } from 'src/modules/auth/constants/messages';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import { ITrack, ITrackNonDraft } from '../interfaces/track.interface';
import { TrackService } from '../services/track.service';

@ApiTags('Tracks')
@Controller('tracks')
export class TrackController {
	constructor(private readonly trackService: TrackService) {}

	@Get()
	async getList(
		@Query() query: QueryGetListTrackDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Track>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.trackService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('with-revenue')
	async getListWithRevenue(
		@Query() query: QueryGetListTrackDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<PageDto<Track>>> {
		const tenantId = req.user!.tenantId;
		if (checkIsNotSystemTenant(tenantId)) {
			query.tenantIds = [tenantId];
		}

		const result = await this.trackService.getListWithRevenue(query);
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/submit')
	async submit(
		@Param('id') id: string,
		@Body() data: SubmitCreateTrackDto,
	): Promise<ResponseSuccess<ITrackNonDraft>> {
		const result = await this.trackService.submit(id, data);

		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	async getDetail(
		@Param('id') id: string,
		@Req() req: Request,
	): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetail(id);

		const tenantId = req.user!.tenantId;
		if (
			checkIsNotSystemTenant(tenantId) &&
			tenantId !== result.release.tenantId
		) {
			throw new ResponseError(AuthMessages.FORBIDDEN);
		}

		return new ResponseSuccess({ data: result });
	}

	@Get(':id/metadata')
	async getDetailMetadata(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetailMetadata(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/audio-file')
	async getDetailAudioFile(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Track>> {
		const result = await this.trackService.getDetailAudioFile(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateTrackDto: UpdateTrackDto,
	): Promise<ResponseSuccess<ITrack>> {
		const result = await this.trackService.update(id, updateTrackDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackMessageCodeSuccess.UPDATE,
		});
	}
}
