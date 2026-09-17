import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Phase 03 persistence.
 *
 * Phase 01 may already be applied in an environment, so submit support is
 * intentionally a separate migration. It only touches distribution_v2.
 */
export class CreateDistributionV2SubmitSupport1789100000000
	implements MigrationInterface
{
	name = 'CreateDistributionV2SubmitSupport1789100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "distribution_v2"."distributions"
			ADD COLUMN "last_command_id" character varying(180)
		`);
		await queryRunner.query(`
			ALTER TABLE "distribution_v2"."channel_deliveries"
			ADD COLUMN "last_command_id" character varying(180)
		`);
		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."submit_idempotencies" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"tenant_id" uuid NOT NULL,
				"release_id" uuid NOT NULL,
				"operation" character varying(30) NOT NULL,
				"idempotency_key" character varying(180) NOT NULL,
				"request_hash" character varying(128) NOT NULL,
				"distribution_id" uuid,
				"correlation_id" uuid,
				"response_payload" jsonb,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_submit_idempotencies"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_submit_idempotency"
					UNIQUE ("tenant_id", "operation", "idempotency_key"),
				CONSTRAINT "FK_distribution_v2_submit_idempotency_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE SET NULL
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_submit_idempotency_release"
			ON "distribution_v2"."submit_idempotencies" ("release_id")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP TABLE IF EXISTS "distribution_v2"."submit_idempotencies"`,
		);
		await queryRunner.query(`
			ALTER TABLE "distribution_v2"."channel_deliveries"
			DROP COLUMN IF EXISTS "last_command_id"
		`);
		await queryRunner.query(`
			ALTER TABLE "distribution_v2"."distributions"
			DROP COLUMN IF EXISTS "last_command_id"
		`);
	}
}
