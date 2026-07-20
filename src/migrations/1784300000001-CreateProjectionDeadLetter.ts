import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectionDeadLetter1784300000001
	implements MigrationInterface
{
	name = 'CreateProjectionDeadLetter1784300000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "projection_dead_letter" (
				"id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
				"checkpoint_name" varchar(80) NOT NULL,
				"event_id"        bigint      NOT NULL,
				"event_type"      varchar(60),
				"error_message"   text,
				"created_at"      timestamptz NOT NULL DEFAULT now()
			)
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_projection_dead_letter_checkpoint"
			  ON "projection_dead_letter" ("checkpoint_name", "event_id")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP TABLE IF EXISTS "projection_dead_letter"`,
		);
	}
}
