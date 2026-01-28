import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
	constructor(private configService: ConfigService) {}

	createTypeOrmOptions(): TypeOrmModuleOptions {
		// const redis = new Redis({
		// 	host: this.configService.get('REDIS_HOST'),
		// 	port: 6379,
		// });

		return {
			type: 'postgres',
			host: this.configService.get<string>('DB_HOST'),
			port: this.configService.get<number>('DB_PORT') || 5432,
			username: this.configService.get<string>('DB_USERNAME'),
			password: this.configService.get<string>('DB_PASSWORD'),
			database: this.configService.get<string>('DB_DATABASE'),

			// Entities
			entities: [__dirname + '/../**/*.entity{.ts,.js}'],
			autoLoadEntities: true,

			// Naming strategy
			namingStrategy: new SnakeNamingStrategy(),

			// Tắt synchronize, dùng migration hoặc sql khi cần thay đổi db
			synchronize:
				this.configService.get<string>('SYNCHRONIZE') === 'true',

			logging: false,
			retryAttempts: 3,

			// cache: {
			// 	type: 'ioredis',
			// 	options: redis,
			// 	duration: 1000 * 60 * 60,
			// },
		};
	}
}
