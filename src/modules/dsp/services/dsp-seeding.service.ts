import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { Dsp } from '../entities/dsp.entity';

interface DspSyncRow {
	pg_uuid: string;
	dsp_code: string;
	dsp_name: string;
	dsp_ci_code: string;
	picture: string;
	type: string;
	created_at: string;
	updated_at: string;
}

@Injectable()
export class DspSeedingService {
	private readonly logger = new Logger(DspSeedingService.name);

	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepository: Repository<Dsp>,
		private readonly clickHouseService: ClickHouseService,
	) {}

	/**
	 * Seed all dsps from PostgreSQL to ClickHouse pg_dsps_sync
	 * Called once during deployment or as a one-time setup
	 */
	async seedFromDsps(): Promise<number> {
		this.logger.log(
			'Starting DSP seeding from PostgreSQL to ClickHouse...',
		);

		const allDsps = await this.dspRepository.find();
		if (allDsps.length === 0) {
			this.logger.warn('No dsps found in PostgreSQL to seed');
			return 0;
		}

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

		const rows: DspSyncRow[] = allDsps.map((dsp) => ({
			pg_uuid: dsp.id,
			dsp_code: dsp.code ?? '',
			dsp_name: dsp.name ?? '',
			dsp_ci_code: dsp.codeCi ?? '',
			picture: dsp.picture ?? '',
			type: dsp.type ?? 'audio',
			created_at: now,
			updated_at: now,
		}));

		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.PG_DSPS_SYNC,
			rows as unknown as Record<string, unknown>[],
		);

		this.logger.log(
			`Seeded ${rows.length} DSP records to ClickHouse pg_dsps_sync`,
		);
		return rows.length;
	}

	/**
	 * Re-sync all dsps (useful when dsps data changed significantly)
	 */
	async resyncAll(): Promise<number> {
		this.logger.log('Starting full DSP re-sync to ClickHouse...');

		// Delete all existing records first
		await this.clickHouseService.query(
			`ALTER TABLE ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} DELETE WHERE 1=1`,
		);

		// Then re-seed
		return this.seedFromDsps();
	}
}
