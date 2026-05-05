import { Global, Module } from '@nestjs/common';
import { CiModule } from './ci/ci.module';
import { SpotifyModule } from './spotify/spotify.module';

@Global()
@Module({
	imports: [CiModule, SpotifyModule],
	exports: [CiModule, SpotifyModule],
})
export class PartnersApiModule {}
