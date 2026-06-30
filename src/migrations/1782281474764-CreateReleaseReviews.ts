import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseReviews1782281474764
	implements MigrationInterface
{
	name = 'CreateReleaseReviews1782281474764';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DO $$
			BEGIN
				CREATE TYPE "public"."release_reviews_status_enum" AS ENUM(
					'PENDING',
					'PROCESSING',
					'COMPLETED',
					'FAILED',
					'CANCEL'
				);
			EXCEPTION
				WHEN duplicate_object THEN null;
			END $$;
		`);

		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "release_reviews" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"release_execution_id" uuid,
				"status" "public"."release_reviews_status_enum" NOT NULL DEFAULT 'PENDING',
				CONSTRAINT "PK_release_reviews_id" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			ALTER TABLE "release_reviews"
			ADD COLUMN IF NOT EXISTS "release_execution_id" uuid
		`);

		await queryRunner.query(`
			ALTER TABLE "release_errors"
			ADD COLUMN IF NOT EXISTS "release_review_id" uuid
		`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_reviews_release_id" ON "release_reviews" ("release_id")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_release_reviews_release_execution_id" ON "release_reviews" ("release_execution_id") WHERE "release_execution_id" IS NOT NULL`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_reviews_status" ON "release_reviews" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_errors_release_review_id" ON "release_errors" ("release_review_id")`,
		);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_reviews_release_id'
				) THEN
					ALTER TABLE "release_reviews"
					ADD CONSTRAINT "FK_release_reviews_release_id"
					FOREIGN KEY ("release_id") REFERENCES "releases"("id")
					ON DELETE CASCADE ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_reviews_release_execution_id'
				) THEN
					ALTER TABLE "release_reviews"
					ADD CONSTRAINT "FK_release_reviews_release_execution_id"
					FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id")
					ON DELETE SET NULL ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_errors_release_review_id'
				) THEN
					ALTER TABLE "release_errors"
					ADD CONSTRAINT "FK_release_errors_release_review_id"
					FOREIGN KEY ("release_review_id") REFERENCES "release_reviews"("id")
					ON DELETE SET NULL ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP CONSTRAINT IF EXISTS "FK_release_errors_release_review_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP CONSTRAINT IF EXISTS "FK_release_reviews_release_execution_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP CONSTRAINT IF EXISTS "FK_release_reviews_release_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_errors_release_review_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_reviews_status"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_reviews_release_execution_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_reviews_release_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP COLUMN IF EXISTS "release_review_id"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "release_reviews"`);
		await queryRunner.query(
			`DROP TYPE IF EXISTS "public"."release_reviews_status_enum"`,
		);
	}
}
