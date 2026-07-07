import { createClient } from '@clickhouse/client';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseMigrationService } from './clickhouse-migration.service';
import { CLICKHOUSE_CLIENT } from './clickhouse.constants';
import { ClickHouseService } from './clickhouse.service';

/**
 * Global ClickHouse module.
 * Provides ClickHouseService to all modules without explicit imports.
 * Runs schema migrations on startup via ClickHouseMigrationService.
 */
@Global()
@Module({
	providers: [
		{
			provide: CLICKHOUSE_CLIENT,
			useFactory: (configService: ConfigService) => {
				const logger = new Logger('ClickHouseModule');

				const url = configService.get<string>('CLICKHOUSE_URL');
				const database = configService.get<string>(
					'CLICKHOUSE_DATABASE',
				);
				const username = configService.get<string>('CLICKHOUSE_USER');
				const password = configService.get<string>(
					'CLICKHOUSE_PASSWORD',
				);

				logger.log(
					`Connecting to ClickHouse at ${url} (database: ${database})`,
				);

				return createClient({
					url,
					database,
					username,
					password,
					clickhouse_settings: {
						async_insert: 1,
						wait_for_async_insert: 1,
					},
					request_timeout: 300_000,
				});
			},
			inject: [ConfigService],
		},
		ClickHouseService,
		ClickHouseMigrationService,
	],
	exports: [ClickHouseService, CLICKHOUSE_CLIENT, ClickHouseMigrationService],
})
export class ClickHouseModule {}
