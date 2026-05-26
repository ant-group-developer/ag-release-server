// controllers/release-dsp-delivery.controller.ts
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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { AppResponseSuccess } from 'src/app.const';
import { ReleaseDspDeliverySuccess } from '../constants/release-dsp.constant';

import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import {
	BulkUpdateReleaseDspDeliveryDto,
	CreateReleaseDspDeliveryDto,
	GetListReleaseDspDeliveriesDto,
	UpdateReleaseDspDeliveryDto,
} from '../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../entities/release-dsp-delivery.entity';
import { ReleaseDspDeliveryService } from '../services/release-dsp-services/release-dsp-delivery.service';

@ApiTags('Release DSP Deliveries')
@Controller('release-dsp-deliveries')
export class ReleaseDspDeliveryController {
	constructor(private readonly service: ReleaseDspDeliveryService) {}

	@Post()
	@ApiOperation({ summary: 'Tạo release dsp delivery' })
	async create(@Body() data: CreateReleaseDspDeliveryDto) {
		const result = await this.service.create({ data });
		return ReleaseDspDeliverySuccess.CREATE(result);
	}

	@Post('sync-and-get/release/:releaseId')
	@ApiOperation({
		summary:
			'Đồng bộ DSP mới (nếu có) và lấy danh sách phân phối theo releaseId',
	})
	async syncAndGetDeliveriesByRelease(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Query() query: GetListReleaseDspDeliveriesDto,
		@User() user: UserReq,
	) {
		const data = await this.service.getAndSyncReleaseDspDeliveries(
			releaseId,
			query,
		);
		return AppResponseSuccess.COMMON(data);
	}

	@Put('bulk')
	@ApiOperation({ summary: 'Bulk update release dsp deliveries' })
	async bulkUpdate(@Body() data: BulkUpdateReleaseDspDeliveryDto) {
		const result = await this.service.bulkUpdate({ data });
		return ReleaseDspDeliverySuccess.BULK_UPDATE(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Cập nhật release dsp delivery' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: ReleaseDspDelivery })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateReleaseDspDeliveryDto,
	) {
		const result = await this.service.update({ id, data });
		return ReleaseDspDeliverySuccess.UPDATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Chi tiết release dsp delivery' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, type: ReleaseDspDelivery })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.service.findOne(id);
		return AppResponseSuccess.COMMON(result);
	}

	@Get()
	@ApiOperation({ summary: 'Danh sách release dsp deliveries' })
	@ApiQuery({ type: GetListReleaseDspDeliveriesDto })
	@ApiResponse({ status: 200, type: [ReleaseDspDelivery] })
	async getList(@Query() query: GetListReleaseDspDeliveriesDto) {
		const result = await this.service.getList(query);
		return AppResponseSuccess.COMMON(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Xóa release dsp delivery' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.service.delete(id);
		return ReleaseDspDeliverySuccess.DELETE();
	}
}
