import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfigService } from 'src/common/config/database.config';
import { AppConfigModule } from '../app-config/app-config.module';
import { BucketModule2 } from '../bucket2/bucket2.module';
import { NotificationModule } from '../notification/notification.module';
import { DatabaseController } from './database.controller';
import { Backup } from './entities/database.backup.entity';
import { DatabaseBackupService } from './services/database.backup.service';
import { DatabaseInitService } from './services/database.init.service';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useClass: DatabaseConfigService,
		}),
		TypeOrmModule.forFeature([Backup]),
		AppConfigModule,
		NotificationModule,
		BucketModule2,
	],
	controllers: [DatabaseController],
	providers: [DatabaseInitService, DatabaseBackupService],
	exports: [DatabaseBackupService],
})
export class DatabaseModule {}
