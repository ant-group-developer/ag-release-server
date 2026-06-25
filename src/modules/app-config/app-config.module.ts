import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { CiToolModule } from '../partners-api/ci-tool/ci-tool.module';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([AppConfig, ArtistRole]), CiToolModule],
	controllers: [AppConfigController],
	providers: [AppConfigService],
	exports: [AppConfigService],
})
export class AppConfigModule {}
