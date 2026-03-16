import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

@Global()
@Module({
	imports: [TypeOrmModule.forFeature([AppConfig])],
	controllers: [AppConfigController],
	providers: [AppConfigService],
	exports: [AppConfigService],
})
export class AppConfigModule {}
