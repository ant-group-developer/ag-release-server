import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewerToReleaseReviews1782722273596
	implements MigrationInterface
{
	name = 'AddReviewerToReleaseReviews1782722273596';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_reviews"
			ADD COLUMN IF NOT EXISTS "reviewer_id" uuid
		`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_reviews_reviewer_id" ON "release_reviews" ("reviewer_id")`,
		);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_reviews_reviewer_id'
				) THEN
					ALTER TABLE "release_reviews"
					ADD CONSTRAINT "FK_release_reviews_reviewer_id"
					FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
					ON DELETE SET NULL ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP CONSTRAINT IF EXISTS "FK_release_reviews_reviewer_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_reviews_reviewer_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP COLUMN IF EXISTS "reviewer_id"`,
		);
	}
}
