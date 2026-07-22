import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 Khối B — cờ tenant `requires_manual_review`.
 *
 * Bật = distribution của tenant dừng ở IN_REVIEW sau validate, chờ admin approve/reject.
 * Default false → hành vi cũ (validate xong đi thẳng provisioning/delivering) không đổi.
 */
export class AddTenantRequiresManualReview1784500000000
	implements MigrationInterface
{
	name = 'AddTenantRequiresManualReview1784500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "requires_manual_review" boolean NOT NULL DEFAULT false`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "requires_manual_review"`,
		);
	}
}
