import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { TimelineAnalyticsService } from '../services/timeline-analytics.service';
import { TimelineQueryDto } from '../dto/analytics-query.dto';
import {
  DspTimelineResponse,
  TerTimelineResponse,
  RevenueOverviewResponse,
  RevenueTimelineResponse,
  RevenueTopDspResponse,
  RevenueTopArtistResponse,
  RevenueTopTrackResponse,
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

  // ═══════════════════════════════════════════════════════
  // REVENUE ANALYTICS
  // ═══════════════════════════════════════════════════════

  @Post('revenue/summary')
  @ApiOperation({
    summary: 'Get revenue overview statistics for tenant',
    description:
      'Returns total revenue (USD), total quantity (plays), and total distinct territories. ' +
      'System-tenant sees all data; normal tenant sees only their own.',
  })
  @ApiResponse({
    status: 201,
    description: 'Revenue overview statistics retrieved successfully.',
  })
  async getRevenueOverview(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<RevenueOverviewResponse>> {
    const data = await this.timelineService.getRevenueOverview(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('revenue/timeline')
  @ApiOperation({
    summary: 'Get monthly revenue timeline for tenant',
    description:
      'Returns monthly revenue (USD) and quantity timeline series to draw charts. ' +
      'System-tenant sees all data; normal tenant sees only their own.',
  })
  @ApiResponse({
    status: 201,
    description: 'Revenue timeline retrieved successfully.',
  })
  async getRevenueTimeline(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<RevenueTimelineResponse>> {
    const data = await this.timelineService.getRevenueTimeline(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('revenue/top-dsp')
  @ApiOperation({
    summary: 'Get top DSPs by revenue for tenant',
    description:
      'Returns top N DSPs sorted by USD revenue. Maps DSP name from pg_dsps_sync first, ' +
      'falling back to dsps_report, and finally native ID.',
  })
  @ApiResponse({
    status: 201,
    description: 'Top DSPs by revenue retrieved successfully.',
  })
  async getRevenueTopDsp(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<RevenueTopDspResponse>> {
    const data = await this.timelineService.getRevenueTopDsp(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('revenue/top-artist')
  @ApiOperation({
    summary: 'Get top artists by revenue for tenant',
    description:
      'Returns top N artists sorted by USD revenue. ' +
      'Groups by artist_ids from pg_tracks_sync. System-tenant sees all data.',
  })
  @ApiResponse({
    status: 201,
    description: 'Top artists by revenue retrieved successfully.',
  })
  async getRevenueTopArtist(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<RevenueTopArtistResponse>> {
    const data = await this.timelineService.getRevenueTopArtist(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  @Post('revenue/top-track')
  @ApiOperation({
    summary: 'Get top tracks by revenue for tenant',
    description:
      'Returns top N tracks sorted by USD revenue. ' +
      'Normal tenant filters by pg_tracks_sync. ' +
      'System-tenant queries all ISRCs in ClickHouse; metadata missing from Postgres is resolved from fact_sales_report.',
  })
  @ApiResponse({
    status: 201,
    description: 'Top tracks by revenue retrieved successfully.',
  })
  async getRevenueTopTrack(
    @Req() req: Request,
    @Body() query: TimelineQueryDto,
  ): Promise<ResponseSuccess<RevenueTopTrackResponse>> {
    const data = await this.timelineService.getRevenueTopTrack(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }
}
