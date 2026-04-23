import { Module } from '@nestjs/common';
import { AppConfigModule } from 'src/modules/app-config/app-config.module';
import { SpotifyController } from './controllers/spotify.controller';
import { SpotifyService } from './services/spotify.service';
import { SpotifyService2 } from './services/spotify2.service';

@Module({
	imports: [AppConfigModule],
	controllers: [SpotifyController],
	providers: [SpotifyService, SpotifyService2],
	exports: [SpotifyService, SpotifyService2],
})
export class SpotifyModule {}
