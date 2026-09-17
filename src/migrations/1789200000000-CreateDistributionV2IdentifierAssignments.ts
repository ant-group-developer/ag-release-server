import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 04 persistence.  This migration is additive and is restricted to
 * the distribution_v2 schema.
 */
export class CreateDistributionV2IdentifierAssignments1789200000000
	implements MigrationInterface
{
	name = 'CreateDistributionV2IdentifierAssignments1789200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."identifier_assignments" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"release_id" uuid NOT NULL,
				"track_id" character varying(64),
				"kind" character varying(10) NOT NULL,
				"source" character varying(30) NOT NULL,
				"value" character varying(20) NOT NULL,
				"request_id" character varying(180) NOT NULL,
				"idempotency_key" character varying(180) NOT NULL,
				"external_operation_id" uuid,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_identifier_assignments"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_identifier_assignment_request"
					UNIQUE ("kind", "request_id"),
				CONSTRAINT "FK_distribution_v2_identifier_assignment_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_identifier_assignment_distribution"
			ON "distribution_v2"."identifier_assignments" ("distribution_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_identifier_assignment_owner"
			ON "distribution_v2"."identifier_assignments"
			("kind", "release_id", "track_id")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP TABLE IF EXISTS "distribution_v2"."identifier_assignments"`,
		);
	}
}
