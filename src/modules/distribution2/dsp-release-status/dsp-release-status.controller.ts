// src/modules/distribution/dsp-release-status/dsp-release-status.controller.ts
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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { User, UserId } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { DspReleaseStatusSuccess } from './const/dsp-release-status.const';
import {
	AutoCreateDspReleaseStatusDto,
	CreateDspReleaseStatusDto,
	GetListDspReleaseStatusesDto,
	UpdateDspReleaseStatusDto,
} from './dto/dsp-release-status.dto';
import { DspReleaseStatus } from './entities/dsp-release-status.entity';
import { DspReleaseStatusService } from './services/dsp-release-status.service';

@ApiTags('DSP Release Status')
// @SystemAdminOnly()
@Controller('distribution/dsp-release-status')
export class DspReleaseStatusController {
	constructor(private readonly svc: DspReleaseStatusService) {}

	@Get()
	@ApiOperation({ summary: 'Get list dsp release statuses' })
	async getList(@Query() filter: GetListDspReleaseStatusesDto) {
		const data = await this.svc.getList(filter);
		return new ResponseSuccess({ data });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get dsp release status detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async getDetail(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<DspReleaseStatus>> {
		const data = await this.svc.findOne(id);
		return new ResponseSuccess({ data });
	}

	@Post()
	@ApiOperation({ summary: 'Create dsp release status' })
	@ApiResponse({ status: 201, type: DspReleaseStatus })
	async create(
		@Body() data: CreateDspReleaseStatusDto,
		@User() user: UserReq,
	): Promise<ResponseSuccess<DspReleaseStatus>> {
		const result = await this.svc.create({ data, userId: user.id });
		return DspReleaseStatusSuccess.CREATE(result);
	}

	@Post('auto-create')
	@ApiOperation({ summary: 'Auto create dsp release status by releaseId' })
	@ApiResponse({ status: 200 })
	async autoCreateByReleaseId(
		@Body() body: AutoCreateDspReleaseStatusDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<any>> {
		const data = await this.svc.autoCreateByReleaseId({ ...body, userId });
		return new ResponseSuccess({ data });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update dsp release status' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: DspReleaseStatus })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateDspReleaseStatusDto,
		@UserId() userId: string,
	): Promise<ResponseSuccess<DspReleaseStatus>> {
		const result = await this.svc.update({ id, data, userId });
		return DspReleaseStatusSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete dsp release status' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.svc.delete({ id });
		return DspReleaseStatusSuccess.DELETE(result);
	}
}
