import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([AppConfig, ArtistRole])],
	controllers: [AppConfigController],
	providers: [AppConfigService],
	exports: [AppConfigService],
})
export class AppConfigModule {}
