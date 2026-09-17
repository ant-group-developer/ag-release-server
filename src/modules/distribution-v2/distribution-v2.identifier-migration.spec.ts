import { QueryRunner } from 'typeorm';
import { CreateDistributionV2IdentifierAssignments1789200000000 } from '../../migrations/1789200000000-CreateDistributionV2IdentifierAssignments';

describe('distribution-v2 identifier assignment migration', () => {
	it('creates only additive assignment persistence with request id uniqueness', async () => {
		const sql: string[] = [];
		const runner = {
			query: jest.fn(async (statement: string) => {
				sql.push(statement);
				return [];
			}),
		} as unknown as QueryRunner;

		await new CreateDistributionV2IdentifierAssignments1789200000000().up(
			runner,
		);
		const joined = sql.join('\n');
		expect(joined).toContain(
			'CREATE TABLE "distribution_v2"."identifier_assignments"',
		);
		expect(joined).toContain(
			'UQ_distribution_v2_identifier_assignment_request',
		);
		expect(joined).toContain('"external_operation_id" uuid');
	});

	it('rolls back only the v2 assignment table', async () => {
		const query = jest.fn(async () => []);
		await new CreateDistributionV2IdentifierAssignments1789200000000().down(
			{ query } as unknown as QueryRunner,
		);
		expect(query).toHaveBeenCalledWith(
			'DROP TABLE IF EXISTS "distribution_v2"."identifier_assignments"',
		);
	});
});
