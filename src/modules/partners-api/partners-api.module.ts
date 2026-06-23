import { Global, Module } from '@nestjs/common';
import { CiToolModule } from './ci-tool/ci-tool.module';
import { CiModule } from './ci/ci.module';
import { SpotifyModule } from './spotify/spotify.module';

@Global()
@Module({
	imports: [CiModule, SpotifyModule, CiToolModule],
	exports: [CiModule, SpotifyModule, CiToolModule],
})
export class PartnersApiModule {}
