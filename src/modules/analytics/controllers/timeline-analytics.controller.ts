import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { TimelineAnalyticsService } from '../services/timeline-analytics.service';
import { TimelineQueryDto } from '../dto/analytics-query.dto';
import {
  DspTimelineResponse,
  TerTimelineResponse,
} from '../interfaces/analytics.interface';

/**
 * Controller thống kê dạng timeline (DSP và Territory) từ nguồn Sales và Trends.
 * Lọc native theo phân quyền Multi-Tenant trên ClickHouse bằng INNER JOIN pg_tracks_sync.
 */
@ApiTags('Analytics')
@Controller('analytics')
export class TimelineAnalyticsController {
  constructor(private readonly timelineService: TimelineAnalyticsService) {}

  // ═══════════════════════════════════════════════════════
  // DSP TIMELINE ENDPOINTS
  // ═══════════════════════════════════════════════════════

  @Post('sales-view/dsp/timeline')
  @ApiOperation({
    summary: 'Get DSP Sales statistics timeline',
    description: 'Returns play counts from official SALES data, grouped by top N DSPs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sales timeline retrieved successfully.',
  })
  async getDspSalesTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<DspTimelineResponse>> {
    const data = await this.timelineService.getDspSalesTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('trend-view/dsp/timeline')
  @ApiOperation({
    summary: 'Get DSP Trends statistics timeline',
    description: 'Returns near real-time play counts from TRENDS data, grouped by top N DSPs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Trends timeline retrieved successfully.',
  })
  async getDspTrendsTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<DspTimelineResponse>> {
    const data = await this.timelineService.getDspTrendsTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('trend-view/dsp/timeline/daily')
  @ApiOperation({
    summary: 'Get DSP Trends daily statistics timeline',
    description: 'Returns near real-time daily play counts from TRENDS data, grouped by top N DSPs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Trends daily timeline retrieved successfully.',
  })
  async getDspTrendsDailyTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<DspTimelineResponse>> {
    const data = await this.timelineService.getDspTrendsDailyTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  // ═══════════════════════════════════════════════════════
  // TERRITORY TIMELINE ENDPOINTS
  // ═══════════════════════════════════════════════════════

  @Post('sales-view/ter/timeline')
  @ApiOperation({
    summary: 'Get Territory Sales statistics timeline',
    description: 'Returns play counts from official SALES data, grouped by top N Territories (countries).',
  })
  @ApiResponse({
    status: 201,
    description: 'Sales territory timeline retrieved successfully.',
  })
  async getTerSalesTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<TerTimelineResponse>> {
    const data = await this.timelineService.getTerSalesTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('trend-view/ter/timeline')
  @ApiOperation({
    summary: 'Get Territory Trends statistics timeline',
    description: 'Returns near real-time play counts from TRENDS data, grouped by top N Territories (countries).',
  })
  @ApiResponse({
    status: 201,
    description: 'Trends territory timeline retrieved successfully.',
  })
  async getTerTrendsTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<TerTimelineResponse>> {
    const data = await this.timelineService.getTerTrendsTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }
}
