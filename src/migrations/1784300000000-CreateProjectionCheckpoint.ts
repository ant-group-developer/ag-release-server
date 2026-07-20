import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectionCheckpoint1784300000000
	implements MigrationInterface
{
	name = 'CreateProjectionCheckpoint1784300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "projection_checkpoint" (
				"name"          varchar(80)  PRIMARY KEY,
				"last_event_id" bigint       NOT NULL DEFAULT 0,
				"updated_at"    timestamptz  NOT NULL DEFAULT now()
			)
		`);

		// Seed initial checkpoint row for release_dsp_delivery projection
		await queryRunner.query(`
			INSERT INTO "projection_checkpoint" ("name", "last_event_id")
			VALUES ('release_dsp_delivery', 0)
			ON CONFLICT DO NOTHING
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "projection_checkpoint"`);
	}
}
