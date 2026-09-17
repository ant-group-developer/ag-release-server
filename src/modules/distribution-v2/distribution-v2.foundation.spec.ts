import { QueryRunner } from 'typeorm';
import { CreateDistributionV2Foundation1789000000000 } from '../../migrations/1789000000000-CreateDistributionV2Foundation';

describe('distribution-v2 foundation migration', () => {
	it('contains the isolated schema and all foundation tables', async () => {
		const sql: string[] = [];
		const queryRunner = {
			query: jest.fn(async (statement: string) => {
				sql.push(statement);
				return [];
			}),
		} as unknown as QueryRunner;

		await new CreateDistributionV2Foundation1789000000000().up(queryRunner);

		const joined = sql.join('\n');
		expect(joined).toContain(
			'CREATE SCHEMA IF NOT EXISTS "distribution_v2"',
		);

		for (const table of [
			'release_snapshots',
			'distributions',
			'channel_deliveries',
			'step_runs',
			'distribution_events',
			'outbox_events',
			'external_operations',
			'export_batches',
			'export_batch_members',
			'issues',
			'distribution_summary',
		]) {
			expect(joined).toContain(
				`CREATE TABLE "distribution_v2"."${table}"`,
			);
		}

		expect(joined).toContain('UQ_distribution_v2_outbox_job_id');
		expect(joined).toContain('UQ_distribution_v2_export_batch_key');
	});

	it('drops only the v2 schema during rollback', async () => {
		const query = jest.fn(async () => []);
		const queryRunner = { query } as unknown as QueryRunner;

		await new CreateDistributionV2Foundation1789000000000().down(
			queryRunner,
		);

		expect(query).toHaveBeenCalledWith(
			'DROP SCHEMA IF EXISTS "distribution_v2" CASCADE',
		);
	});
});
