import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { YoutubeApiKeyAdminController } from './admin/youtube-api-key.controller';
import { YoutubeChannelSyncController } from './admin/youtube-channel-sync.controller';
import { YoutubeApiKey } from './entities/youtube-api-key.entity';
import { YoutubeChannelSyncLog } from './entities/youtube-channel-sync-log.entity';
import { YoutubeChannelSyncRun } from './entities/youtube-channel-sync-run.entity';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { YoutubeApiClientService } from './services/youtube-api-client.service';
import { YoutubeApiKeyPoolService } from './services/youtube-api-key-pool.service';
import { YoutubeApiKeyService } from './services/youtube-api-key.service';
import { YoutubeChannelSyncService } from './services/youtube-channel-sync.service';
import { YoutubeEncryptionService } from './services/youtube-encryption.service';
import { YoutubeEnrichmentService } from './services/youtube-enrichment.service';
import { YoutubeSearchCacheService } from './services/youtube-search-cache.service';

@Module({
	imports: [
		// ScheduleModule.forRoot(),
		TypeOrmModule.forFeature([
			YoutubeApiKey,
			YoutubeSearchCache,
			YoutubeChannelSyncLog,
			YoutubeChannelSyncRun,
			Channel,
		]),
	],
	controllers: [YoutubeApiKeyAdminController, YoutubeChannelSyncController],
	providers: [
		YoutubeEncryptionService,
		YoutubeApiKeyService,
		YoutubeApiKeyPoolService,
		YoutubeApiClientService,
		YoutubeSearchCacheService,
		YoutubeEnrichmentService,
		YoutubeChannelSyncService,
	],
	exports: [
		YoutubeEnrichmentService,
		YoutubeApiKeyPoolService,
		YoutubeApiKeyService,
	],
})
export class YoutubeModule {}
