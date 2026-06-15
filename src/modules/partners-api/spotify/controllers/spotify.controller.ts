import { Body, Controller, Get, Param, Post, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SpotifyService } from '../services/spotify.service';
import { SpotifyService2 } from '../services/spotify2.service';
import { MetadataEnrichmentService } from '../services/metadata-enrichment.service';
import { MetadataScanService } from '../services/metadata-scan.service';

@ApiTags('Partners API')
@Controller('partners')
export class SpotifyController {
	private readonly logger = new Logger(SpotifyController.name);

	constructor(
		private readonly spotifyService: SpotifyService,
		private readonly spotifyService2: SpotifyService2,
		private readonly metadataEnrichmentService: MetadataEnrichmentService,
		private readonly metadataScanService: MetadataScanService,
	) {}

	@Post('spotify/token')
	async getToken(@Body() body: { clientId?: string; clientSecret?: string }) {
		const data = await this.spotifyService.getToken(body?.clientId, body?.clientSecret);
		return new ResponseSuccess({ data });
	}

	@Get('spotify/artists/:id')
	async getArtistDetail(@Param('id') id: string) {
		const data = await this.spotifyService2.getArtistDetail(id);
		return new ResponseSuccess({ data });
	}

	// ─── ENRICHMENT ENDPOINTS ────────────────────────────

	@Get('enrich/isrc/:isrc')
	@ApiOperation({ summary: 'Look up a single ISRC via Spotify/Deezer and return enriched metadata' })
	async enrichByIsrc(@Param('isrc') isrc: string) {
		const result = await this.metadataEnrichmentService.enrichByIsrc(isrc);
		return new ResponseSuccess({
			data: {
				isrc,
				found: !!result,
				data: result,
			},
		});
	}

	@Post('enrich/scan')
	@ApiOperation({
		summary: 'Scan report-imported releases and enrich metadata via Spotify/Deezer',
		description:
			'Scans releases with placeholder UPCs (ISRC-xxx) or missing metadata. ' +
			'Enriches with real data from Spotify/Deezer APIs. ' +
			'Every change is logged to ClickHouse `metadata_enrichment_log`. ' +
			'Use dryRun=true to preview. If limit is not provided, runs for ALL releases in background.',
	})
	@ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Preview changes without writing to DB' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max releases to process (omit to run ALL in background)' })
	@ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force re-scan already enriched releases' })
	async scanAndEnrich(
		@Query('dryRun') dryRun?: string,
		@Query('limit') limit?: string,
		@Query('force') force?: string,
	) {
		const isDryRun = dryRun === 'true';
		const parsedLimit = limit ? parseInt(limit, 10) : undefined;
		const isForce = force === 'true';
		const scanId = uuidv4();

		// Always run the scan asynchronously in the background
		this.metadataScanService
			.scanAndEnrichAll({
				dryRun: isDryRun,
				limit: parsedLimit,
				scanId,
				force: isForce,
			})
			.catch((err) => {
				this.logger.error(`Background scan failed: ${err.message}`, err.stack);
			});

		const summary = await this.metadataScanService.getEnrichmentSummary();
		return new ResponseSuccess({
			data: {
				message: 'Scan started in the background',
				scanId,
				dryRun: isDryRun,
				force: isForce,
				limit: parsedLimit,
				summary,
			},
		});
	}

	@Get('enrich/history')
	@ApiOperation({
		summary: 'Query enrichment change history from ClickHouse',
		description: 'View all changes logged during enrichment scans.',
	})
	@ApiQuery({ name: 'scanId', required: false, type: String, description: 'Filter by scan ID' })
	@ApiQuery({ name: 'isrc', required: false, type: String, description: 'Filter by ISRC' })
	@ApiQuery({ name: 'releaseId', required: false, type: String, description: 'Filter by release ID' })
	@ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (default 100)' })
	async getChangeHistory(
		@Query('scanId') scanId?: string,
		@Query('isrc') isrc?: string,
		@Query('releaseId') releaseId?: string,
		@Query('limit') limit?: string,
	) {
		const [items, summary] = await Promise.all([
			this.metadataScanService.getChangeHistory({
				scanId,
				isrc,
				releaseId,
				limit: limit ? parseInt(limit, 10) : 100,
			}),
			this.metadataScanService.getEnrichmentSummary(),
		]);
		return new ResponseSuccess({
			data: {
				summary,
				items,
			},
		});
	}
}
