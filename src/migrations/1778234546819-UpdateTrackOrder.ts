import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778234546819 implements MigrationInterface {
	name = 'Migration1778234546819';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			WITH ranked_tracks AS (
				SELECT
					id,
					ROW_NUMBER() OVER (
						PARTITION BY release_id
						ORDER BY isrc ASC NULLS LAST, created_at ASC, id ASC
					) - 1 AS new_order
				FROM tracks
			)
			UPDATE tracks t
			SET "order" = rt.new_order
			FROM ranked_tracks rt
			WHERE t.id = rt.id
				AND t."order" IS DISTINCT FROM rt.new_order
		`);

		await queryRunner.query(`
			ALTER TABLE "tracks"
			ADD CONSTRAINT "UQ_tracks_release_id_order"
			UNIQUE ("release_id", "order")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "tracks"
			DROP CONSTRAINT "UQ_tracks_release_id_order"
		`);
	}
}