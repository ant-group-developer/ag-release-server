import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoteToReleaseReviews1782722273598
	implements MigrationInterface
{
	name = 'AddNoteToReleaseReviews1782722273598';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_reviews"
			ADD COLUMN IF NOT EXISTS "note" text
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_reviews"
			DROP COLUMN IF EXISTS "note"
		`);
	}
}
