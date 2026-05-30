import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  PageDto,
  ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { RankingService } from '../services/ranking.service';
import { RankingQueryDto } from '../dto';
import {
  TrackRankingItem,
  ReleaseRankingItem,
  ArtistRankingItem,
  LabelRankingItem,
} from '../interfaces/analytics.interface';

/**
 * Controller bảng xếp hạng — dữ liệu từ bảng Trends (ClickHouse).
 * Metadata (track, release, artist, label) lấy từ PostgreSQL.
 * Guard: JwtAuthGuard + PolicyGuard đã đăng ký global (APP_GUARD).
 */
@ApiTags('Analytics')
@Controller('analytics/ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  /**
   * Top Tracks theo lượt nghe.
   * POST /analytics/ranking/tracks
   */
  @Post('tracks')
  @ApiOperation({
    summary: 'Get top tracks ranking',
    description:
      'Returns the most played tracks for the tenant within the specified period, enriched with metadata from PostgreSQL.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tracks ranking retrieved successfully.',
  })
  async getTopTracks(
    @Req() req: Request,
    @Body() query: RankingQueryDto,
  ): Promise<ResponseSuccess<PageDto<TrackRankingItem>>> {
    const data = await this.rankingService.getTopTracks(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  /**
   * Top Releases theo lượt nghe.
   * Aggregate nhiều ISRCs/tracks thuộc cùng release.
   * POST /analytics/ranking/releases
   */
  @Post('releases')
  @ApiOperation({
    summary: 'Get top releases ranking',
    description:
      'Returns the most played releases (albums/singles) for the tenant, aggregating play counts from all their tracks.',
  })
  @ApiResponse({
    status: 201,
    description: 'Releases ranking retrieved successfully.',
  })
  async getTopReleases(
    @Req() req: Request,
    @Body() query: RankingQueryDto,
  ): Promise<ResponseSuccess<PageDto<ReleaseRankingItem>>> {
    const data = await this.rankingService.getTopReleases(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  /**
   * Top Artists theo lượt nghe.
   * 1 track có nhiều artists → views tính cho TẤT CẢ artists.
   * POST /analytics/ranking/artists
   */
  @Post('artists')
  @ApiOperation({
    summary: 'Get top artists ranking',
    description:
      'Returns the most played artists for the tenant, aggregating play counts across all tracks they are credited on.',
  })
  @ApiResponse({
    status: 201,
    description: 'Artists ranking retrieved successfully.',
  })
  async getTopArtists(
    @Req() req: Request,
    @Body() query: RankingQueryDto,
  ): Promise<ResponseSuccess<PageDto<ArtistRankingItem>>> {
    const data = await this.rankingService.getTopArtists(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }

  /**
   * Top Labels theo lượt nghe.
   * Aggregate qua: tracks → releases → labels.
   * POST /analytics/ranking/labels
   */
  @Post('labels')
  @ApiOperation({
    summary: 'Get top labels ranking',
    description:
      'Returns the most played labels for the tenant, aggregating play counts across all their releases and tracks.',
  })
  @ApiResponse({
    status: 201,
    description: 'Labels ranking retrieved successfully.',
  })
  async getTopLabels(
    @Req() req: Request,
    @Body() query: RankingQueryDto,
  ): Promise<ResponseSuccess<PageDto<LabelRankingItem>>> {
    const data = await this.rankingService.getTopLabels(
      req.user!.tenantId,
      query,
    );
    return new ResponseSuccess({ data });
  }
}
