import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantManualReviewPolicy1789123456789
	implements MigrationInterface
{
	name = 'AddTenantManualReviewPolicy1789123456789';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "tenants"
			ADD COLUMN "requires_manual_review" boolean NOT NULL DEFAULT false
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "tenants"
			DROP COLUMN "requires_manual_review"
		`);
	}
}