import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1783000000000 implements MigrationInterface {
	name = 'Migration1783000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "auto_submit_history" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"input" jsonb NOT NULL,
				"preview_data" jsonb NOT NULL,
				"total_releases" integer NOT NULL DEFAULT 0,
				CONSTRAINT "PK_auto_submit_history_id" PRIMARY KEY ("id")
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS "auto_submit_history"`);
	}
}
