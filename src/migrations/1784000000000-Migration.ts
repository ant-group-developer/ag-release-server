import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1784000000000 implements MigrationInterface {
	name = 'Migration1784000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "orchestration_ticket" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"channel_id" varchar(80),
				"reason" varchar(30) NOT NULL,
				"detail" text NOT NULL,
				"metadata" jsonb,
				"status" varchar(20) NOT NULL DEFAULT 'open',
				"idempotency_key" varchar(200) NOT NULL,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"resolved_at" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_orchestration_ticket_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_orch_ticket_idempotency_key" UNIQUE ("idempotency_key")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_orch_ticket_dist_status"
				ON "orchestration_ticket" ("distribution_id", "status")
		`);

		// Partial index — only tickets with a channel_id.
		// Most tickets are at distribution level (channel_id IS NULL).
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_orch_ticket_channel_status"
				ON "orchestration_ticket" ("channel_id", "status")
				WHERE "channel_id" IS NOT NULL
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_orch_ticket_channel_status"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_orch_ticket_dist_status"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "orchestration_ticket"`,
		);
	}
}
