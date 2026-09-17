/* eslint-disable @typescript-eslint/require-await */
import { QueryRunner } from 'typeorm';
import { CreateDistributionV2SubmitSupport1789100000000 } from '../../migrations/1789100000000-CreateDistributionV2SubmitSupport';

describe('distribution-v2 submit support migration', () => {
	it('adds idempotency and command identity columns without touching legacy tables', async () => {
		const sql: string[] = [];
		const queryRunner = {
			query: jest.fn(async (statement: string) => {
				sql.push(statement);
				return [];
			}),
		} as unknown as QueryRunner;

		await new CreateDistributionV2SubmitSupport1789100000000().up(
			queryRunner,
		);

		const joined = sql.join('\n');
		expect(joined).toContain(
			'ALTER TABLE "distribution_v2"."distributions"',
		);
		expect(joined).toContain(
			'ALTER TABLE "distribution_v2"."channel_deliveries"',
		);
		expect(joined).toContain(
			'CREATE TABLE "distribution_v2"."submit_idempotencies"',
		);
		expect(joined).toContain('UQ_distribution_v2_submit_idempotency');
		expect(joined).not.toContain('release_execution');
	});

	it('rolls back only additive submit support objects', async () => {
		const query = jest.fn(async (_statement: string) => []);
		const queryRunner = { query } as unknown as QueryRunner;

		await new CreateDistributionV2SubmitSupport1789100000000().down(
			queryRunner,
		);

		expect(query.mock.calls[0]?.[0]).toContain(
			'DROP TABLE IF EXISTS "distribution_v2"."submit_idempotencies"',
		);
		expect(query.mock.calls[1]?.[0]).toContain(
			'DROP COLUMN IF EXISTS "last_command_id"',
		);
		expect(query.mock.calls[2]?.[0]).toContain(
			'DROP COLUMN IF EXISTS "last_command_id"',
		);
	});
});
