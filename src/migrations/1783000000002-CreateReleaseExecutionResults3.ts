import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseExecutionResults31783000000002
	implements MigrationInterface
{
	name = 'CreateReleaseExecutionResults31783000000002';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "release_execution_results3" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_execution_id" uuid NOT NULL,
				"release_execution_step_id" uuid,
				"release_id" uuid,
				"dsp_id" character varying(10) NOT NULL,
				"status" character varying(50) NOT NULL,
				CONSTRAINT "pk_release_execution_results3" PRIMARY KEY ("id"),
				CONSTRAINT "uq_release_execution_results3_execution_dsp" UNIQUE ("release_execution_id", "dsp_id")
			)
		`);

		await queryRunner.query(`
			CREATE INDEX "idx_release_execution_results3_release"
			ON "release_execution_results3" ("release_id")
		`);

		await queryRunner.query(`
			CREATE INDEX "idx_release_execution_results3_step"
			ON "release_execution_results3" ("release_execution_step_id")
		`);

		await queryRunner.query(`
			CREATE INDEX "idx_release_execution_results3_status"
			ON "release_execution_results3" ("status")
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			ADD CONSTRAINT "fk_release_execution_results3_execution"
			FOREIGN KEY ("release_execution_id")
			REFERENCES "release_excutions3"("id")
			ON DELETE CASCADE
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			ADD CONSTRAINT "fk_release_execution_results3_step"
			FOREIGN KEY ("release_execution_step_id")
			REFERENCES "release_execution_steps3"("id")
			ON DELETE SET NULL
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			ADD CONSTRAINT "fk_release_execution_results3_release"
			FOREIGN KEY ("release_id")
			REFERENCES "releases"("id")
			ON DELETE CASCADE
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			ADD CONSTRAINT "fk_release_execution_results3_dsp"
			FOREIGN KEY ("dsp_id")
			REFERENCES "dsps"("id")
			ON DELETE CASCADE
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			DROP CONSTRAINT "fk_release_execution_results3_dsp"
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			DROP CONSTRAINT "fk_release_execution_results3_release"
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			DROP CONSTRAINT "fk_release_execution_results3_step"
		`);

		await queryRunner.query(`
			ALTER TABLE "release_execution_results3"
			DROP CONSTRAINT "fk_release_execution_results3_execution"
		`);

		await queryRunner.query(`
			DROP INDEX "idx_release_execution_results3_status"
		`);

		await queryRunner.query(`
			DROP INDEX "idx_release_execution_results3_step"
		`);

		await queryRunner.query(`
			DROP INDEX "idx_release_execution_results3_release"
		`);

		await queryRunner.query(`
			DROP TABLE "release_execution_results3"
		`);
	}
}
