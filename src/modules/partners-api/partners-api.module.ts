import { Global, Module } from '@nestjs/common';
import { SpotifyModule } from './spotify/spotify.module';
import { CiModule } from './ci/ci.module';

@Global()
@Module({
	imports: [CiModule, SpotifyModule],
	exports: [CiModule, SpotifyModule],
})
export class PartnersApiModule {}