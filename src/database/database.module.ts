import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigCustomModule } from 'src/config/config.module';
import { getTypeOrmConfig } from './database.config';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			imports: [ConfigCustomModule],
			inject: [ConfigService],
			// useClass: DatabaseOptions,
			useFactory: getTypeOrmConfig,
		}),
	],
})
export class DatabaseModule {}
