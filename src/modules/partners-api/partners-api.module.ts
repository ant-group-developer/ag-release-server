import { Global, Module } from '@nestjs/common';
import { CiModule } from './ci/ci.module';
import { SpotifyModule } from './spotify/spotify.module';
import { CiToolModule } from './ci-tool/ci-tool.module';

@Global()
@Module({
	imports: [CiModule, SpotifyModule, CiToolModule],
	exports: [CiModule, SpotifyModule, CiToolModule],
})
export class PartnersApiModule { }
