import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778581138983 implements MigrationInterface {
	name = 'Migration1778581138983';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
            CREATE INDEX "IDX_release_artist_release_id"
            ON "release_artist" ("release_id")
        `);

		await queryRunner.query(`
            CREATE INDEX "IDX_release_contributors_release_id"
            ON "release_contributors" ("release_id")
        `);

		await queryRunner.query(`
            CREATE INDEX "IDX_release_cover_art_release_id"
            ON "release_cover_art" ("release_id")
        `);

		await queryRunner.query(`
            CREATE INDEX "IDX_track_artist_track_id"
            ON "track_artist" ("track_id")
        `);

		await queryRunner.query(`
            CREATE INDEX "IDX_track_contributors_track_id"
            ON "track_contributors" ("track_id")
        `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
            DROP INDEX "public"."IDX_track_contributors_track_id"
        `);

		await queryRunner.query(`
            DROP INDEX "public"."IDX_track_artist_track_id"
        `);

		await queryRunner.query(`
            DROP INDEX "public"."IDX_release_cover_art_release_id"
        `);

		await queryRunner.query(`
            DROP INDEX "public"."IDX_release_contributors_release_id"
        `);

		await queryRunner.query(`
            DROP INDEX "public"."IDX_release_artist_release_id"
        `);
	}
}