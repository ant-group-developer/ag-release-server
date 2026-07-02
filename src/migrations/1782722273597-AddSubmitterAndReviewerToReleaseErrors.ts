import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubmitterAndReviewerToReleaseErrors1782722273597
	implements MigrationInterface
{
	name = 'AddSubmitterAndReviewerToReleaseErrors1782722273597';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_errors"
			ADD COLUMN IF NOT EXISTS "submitter_id" uuid
		`);

		await queryRunner.query(`
			ALTER TABLE "release_errors"
			ADD COLUMN IF NOT EXISTS "reviewer_id" uuid
		`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_errors_submitter_id" ON "release_errors" ("submitter_id")`,
		);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_errors_reviewer_id" ON "release_errors" ("reviewer_id")`,
		);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_errors_submitter_id'
				) THEN
					ALTER TABLE "release_errors"
					ADD CONSTRAINT "FK_release_errors_submitter_id"
					FOREIGN KEY ("submitter_id") REFERENCES "users"("id")
					ON DELETE SET NULL ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_errors_reviewer_id'
				) THEN
					ALTER TABLE "release_errors"
					ADD CONSTRAINT "FK_release_errors_reviewer_id"
					FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
					ON DELETE SET NULL ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT IF EXISTS "FK_release_errors_reviewer_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT IF EXISTS "FK_release_errors_submitter_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_errors_reviewer_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_errors_submitter_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP COLUMN IF EXISTS "reviewer_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP COLUMN IF EXISTS "submitter_id"`,
		);
	}
}
