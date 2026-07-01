import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseCiData1782722273600 implements MigrationInterface {
	name = 'CreateReleaseCiData1782722273600';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TYPE "public"."release_ci_data_status_enum" AS ENUM(
				'EXISTS_ON_CI',
				'NOT_FOUND_ON_CI'
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "release_ci_data" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"latest_synced_at" TIMESTAMP WITH TIME ZONE,
				"status" "public"."release_ci_data_status_enum" NOT NULL DEFAULT 'NOT_FOUND_ON_CI',
				"import_raw_data" jsonb,
				"export_raw_data" jsonb,
				"import_parsed_data" jsonb,
				"export_parsed_data" jsonb,
				CONSTRAINT "PK_release_ci_data_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_release_ci_data_release_id" UNIQUE ("release_id")
			)
		`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_ci_data_status" ON "release_ci_data" ("status")`,
		);

		await queryRunner.query(`
			ALTER TABLE "release_ci_data"
			ADD CONSTRAINT "FK_release_ci_data_release_id"
			FOREIGN KEY ("release_id") REFERENCES "releases"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_ci_data" DROP CONSTRAINT IF EXISTS "FK_release_ci_data_release_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_ci_data_status"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_ci_data"`);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "public"."release_ci_data_status_enum"`,
		);
	}
}
