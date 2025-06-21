import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfigService } from 'src/common/config/database.config';
import { DatabaseController } from './database.controller';
import { DatabaseBackupService } from './services/database.backup-service';
import { DatabaseInitService } from './services/database.init-service';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useClass: DatabaseConfigService,
		}),
	],
	controllers: [DatabaseController],
	providers: [DatabaseInitService, DatabaseBackupService],
	exports: [DatabaseBackupService],
})
export class DatabaseModule {}
