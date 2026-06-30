import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1782722273595 implements MigrationInterface {
	name = 'Migration1782722273595';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_reviews"
			ADD COLUMN IF NOT EXISTS "step_id" uuid
		`);

		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_release_reviews_step_id" ON "release_reviews" ("step_id")`,
		);

		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					WHERE conname = 'FK_release_reviews_step_id'
				) THEN
					ALTER TABLE "release_reviews"
					ADD CONSTRAINT "FK_release_reviews_step_id"
					FOREIGN KEY ("step_id") REFERENCES "release_execution_steps3"("id")
					ON DELETE CASCADE ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP CONSTRAINT IF EXISTS "FK_release_reviews_step_id"`,
		);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "public"."IDX_release_reviews_step_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_reviews" DROP COLUMN IF EXISTS "step_id"`,
		);
	}
}
