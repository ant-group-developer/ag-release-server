import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { YoutubeApiKeyAdminController } from './admin/youtube-api-key.controller';
import { YoutubeApiKey } from './entities/youtube-api-key.entity';
import { YoutubeSearchCache } from './entities/youtube-search-cache.entity';
import { YoutubeApiClientService } from './services/youtube-api-client.service';
import { YoutubeApiKeyPoolService } from './services/youtube-api-key-pool.service';
import { YoutubeApiKeyService } from './services/youtube-api-key.service';
import { YoutubeEncryptionService } from './services/youtube-encryption.service';
import { YoutubeEnrichmentService } from './services/youtube-enrichment.service';
import { YoutubeSearchCacheService } from './services/youtube-search-cache.service';

@Module({
	imports: [
		// ScheduleModule.forRoot(),
		TypeOrmModule.forFeature([YoutubeApiKey, YoutubeSearchCache, Channel]),
	],
	controllers: [YoutubeApiKeyAdminController],
	providers: [
		YoutubeEncryptionService,
		YoutubeApiKeyService,
		YoutubeApiKeyPoolService,
		YoutubeApiClientService,
		YoutubeSearchCacheService,
		YoutubeEnrichmentService,
	],
	exports: [
		YoutubeEnrichmentService,
		YoutubeApiKeyPoolService,
		YoutubeApiKeyService,
	],
})
export class YoutubeModule {}
