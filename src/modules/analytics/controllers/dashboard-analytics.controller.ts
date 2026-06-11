import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { DashboardAnalyticsService } from '../services/dashboard-analytics.service';
import { DashboardAnalyticsQueryDto } from '../dto/analytics-query.dto';

@ApiTags('Analytics - Dashboard')
@Controller('analytic/dashboard')
export class DashboardAnalyticsController {
  constructor(private readonly dashboardService: DashboardAnalyticsService) {}

  @Post('dsp')
  @ApiOperation({ summary: 'Get top N DSPs dashboard stats (stream or revenue)' })
  async getDspDashboard(
    @Req() req: Request,
    @Body() dto: DashboardAnalyticsQueryDto,
  ) {
    const result = await this.dashboardService.getDspDashboard(req.user!.tenantId, dto);
    return new ResponseSuccess({ data: result });
  }

  @Post('label')
  @ApiOperation({ summary: 'Get top N Labels dashboard stats (stream or revenue)' })
  async getLabelDashboard(
    @Req() req: Request,
    @Body() dto: DashboardAnalyticsQueryDto,
  ) {
    const result = await this.dashboardService.getLabelDashboard(req.user!.tenantId, dto);
    return new ResponseSuccess({ data: result });
  }

  @Post('artist')
  @ApiOperation({ summary: 'Get top N Artists dashboard stats (stream or revenue)' })
  async getArtistDashboard(
    @Req() req: Request,
    @Body() dto: DashboardAnalyticsQueryDto,
  ) {
    const result = await this.dashboardService.getArtistDashboard(req.user!.tenantId, dto);
    return new ResponseSuccess({ data: result });
  }
}
