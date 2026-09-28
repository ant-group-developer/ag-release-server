import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { DemographicsQueryDto } from '../dto/analytics-query.dto';
import { DemographicsAnalyticsService } from '../services/demographics-analytics.service';

@ApiTags('Analytics - Track')
@Controller('analytics/track/:isrc')
export class TrackAnalyticsController {
	constructor(
		private readonly demographicsSvc: DemographicsAnalyticsService,
	) {}

	@Post('demographics/device')
	@ApiOperation({
		summary:
			'Vevo device breakdown của track (views + % theo tổng views devices)',
	})
	async demographicsDevice(
		@Param('isrc') isrc: string,
		@Body() dto: DemographicsQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.demographicsSvc.getDeviceBreakdown(
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('demographics/gender')
	@ApiOperation({
		summary:
			'Vevo gender breakdown của track (views_estimate + %, không chuẩn hoá chéo theo total views)',
	})
	async demographicsGender(
		@Param('isrc') isrc: string,
		@Body() dto: DemographicsQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.demographicsSvc.getGenderBreakdown(
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('demographics/age')
	@ApiOperation({
		summary:
			'Vevo age breakdown của track (views_estimate + %, sắp xếp theo thứ tự bucket tuổi)',
	})
	async demographicsAge(
		@Param('isrc') isrc: string,
		@Body() dto: DemographicsQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.demographicsSvc.getAgeBreakdown(
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
