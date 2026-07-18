import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
	constructor(private configService: ConfigService) {}

	createTypeOrmOptions(): TypeOrmModuleOptions {
		return {
			type: 'postgres',
			host: this.configService.get<string>('DB_HOST'),
			port: this.configService.get<number>('DB_PORT'),
			username: this.configService.get<string>('DB_USERNAME'),
			password: this.configService.get<string>('DB_PASSWORD'),
			database: this.configService.get<string>('DB_DATABASE'),

			// Entities
			entities: [__dirname + '/../**/*.entity{.ts,.js}'],
			autoLoadEntities: true,

			// Naming strategy
			namingStrategy: new SnakeNamingStrategy(),

			// Tắt synchronize, dùng migration hoặc sql khi cần thay đổi db
			synchronize: this.configService.get<boolean>('DB_SYNCHRONIZE'),

			logging: this.configService.get<boolean>('DB_LOGGING'),
			retryAttempts: this.configService.get<number>('DB_RETRY_CONNECT'),
		};
	}
}

config();

const configService = new ConfigService();

export default new DataSource({
	type: 'postgres',
	host: configService.get('DB_HOST'),
	port: configService.get('DB_PORT'),
	username: configService.get('DB_USERNAME'),
	password: configService.get('DB_PASSWORD'),
	database: configService.get('DB_DATABASE'),
	entities: [
		__dirname + '/../../**/*.entity{.ts,.js}',
		__dirname + '/../../**/*.entities{.ts,.js}',
		__dirname + '/../../**/*.orm-entity{.ts,.js}',
	],
	migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
	migrationsTableName: 'migrations',
	namingStrategy: new SnakeNamingStrategy(),
});
