import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillMissingAssetOwnership1788000000000
	implements MigrationInterface
{
	name = 'BackfillMissingAssetOwnership1788000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			INSERT INTO asset_ownership_periods
				(release_id, tenant_id, label_id, effective_from, revenue_effective_from)
			SELECT r.id, r.tenant_id, r.label_id, DATE '1900-01-01', DATE '1900-01-01'
			FROM releases r
			WHERE r.tenant_id IS NOT NULL
			  AND NOT EXISTS (
				SELECT 1 FROM asset_ownership_periods p WHERE p.release_id = r.id
			  )
		`);
	}

	public async down(): Promise<void> {
		// Baseline ownership is financial history and must not be deleted on rollback.
	}
}
