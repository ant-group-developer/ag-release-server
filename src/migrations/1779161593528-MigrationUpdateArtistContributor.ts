import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1779161593528 implements MigrationInterface {
	name = 'Migration1779161593528';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE track_contributors tc
			SET created_at = rc.created_at
			FROM release_contributors rc
			WHERE tc.release_contributor_id = rc.id
			  AND tc.release_contributor_id IS NOT NULL
			  AND tc.is_from_release_action = true
		`);

		await queryRunner.query(`
			UPDATE track_artist ta
			SET created_at = ra.created_at
			FROM release_artist ra
			WHERE ta.release_artist_id = ra.id
			  AND ta.release_artist_id IS NOT NULL
			  AND ta.is_from_release_action = true
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {}
}