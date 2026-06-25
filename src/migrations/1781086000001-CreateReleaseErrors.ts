import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseErrors1781086000001 implements MigrationInterface {
	name = 'CreateReleaseErrors1781086000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "public"."release_errors_type_enum" AS ENUM('admin_create', 'import_ci', 'qa_flag_ci')`,
		);
		await queryRunner.query(`
			CREATE TABLE "release_errors" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"release_execution_id" uuid,
				"step_id" uuid,
				"is_fixed" boolean NOT NULL DEFAULT false,
				"message_code" character varying,
				"message" text NOT NULL,
				"page" character varying,
				"field" character varying,
				"track_id" uuid,
				"type" "public"."release_errors_type_enum",
				CONSTRAINT "PK_release_errors_id" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_release_id" ON "release_errors" ("release_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_release_execution_id" ON "release_errors" ("release_execution_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_step_id" ON "release_errors" ("step_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_is_fixed" ON "release_errors" ("is_fixed")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_type" ON "release_errors" ("type")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD CONSTRAINT "FK_release_errors_release_id" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD CONSTRAINT "FK_release_errors_release_execution_id" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD CONSTRAINT "FK_release_errors_step_id" FOREIGN KEY ("step_id") REFERENCES "release_execution_steps3"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT "FK_release_errors_step_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT "FK_release_errors_release_execution_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT "FK_release_errors_release_id"`,
		);
		await queryRunner.query(`DROP INDEX "public"."IDX_release_errors_type"`);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_release_errors_is_fixed"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_release_errors_step_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_release_errors_release_execution_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_release_errors_release_id"`,
		);
		await queryRunner.query(`DROP TABLE "release_errors"`);
		await queryRunner.query(`DROP TYPE "public"."release_errors_type_enum"`);
	}
}
