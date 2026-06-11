import { Global, Module } from '@nestjs/common';
import { CiToolModule } from './ci-tool/ci-tool.module';
import { CiModule } from './ci/ci.module';
import { SpotifyModule } from './spotify/spotify.module';
import { VevoModule } from './vevo/vevo.module';

@Global()
@Module({
	imports: [CiModule, SpotifyModule, CiToolModule, VevoModule],
	exports: [CiModule, SpotifyModule, CiToolModule, VevoModule],
})
export class PartnersApiModule {}
