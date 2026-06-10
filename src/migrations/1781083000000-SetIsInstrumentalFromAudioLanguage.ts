import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetIsInstrumentalFromAudioLanguage1781083000000
	implements MigrationInterface
{
	name = 'SetIsInstrumentalFromAudioLanguage1781083000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "releases"
			SET "is_instrumental" = true
			WHERE EXISTS (
				SELECT 1
				FROM "release_language"
				INNER JOIN "languages"
					ON "languages"."id" = "release_language"."audio_language_id"
				WHERE "release_language"."release_id" = "releases"."id"
					AND LOWER("languages"."code") = 'zxx'
			)
		`);

		await queryRunner.query(`
			UPDATE "tracks"
			SET "is_instrumental" = true
			WHERE EXISTS (
				SELECT 1
				FROM "track_language"
				INNER JOIN "languages"
					ON "languages"."id" = "track_language"."audio_language_id"
				WHERE "track_language"."track_id" = "tracks"."id"
					AND LOWER("languages"."code") = 'zxx'
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "releases"
			SET "is_instrumental" = false
			WHERE EXISTS (
				SELECT 1
				FROM "release_language"
				INNER JOIN "languages"
					ON "languages"."id" = "release_language"."audio_language_id"
				WHERE "release_language"."release_id" = "releases"."id"
					AND LOWER("languages"."code") = 'zxx'
			)
		`);

		await queryRunner.query(`
			UPDATE "tracks"
			SET "is_instrumental" = false
			WHERE EXISTS (
				SELECT 1
				FROM "track_language"
				INNER JOIN "languages"
					ON "languages"."id" = "track_language"."audio_language_id"
				WHERE "track_language"."track_id" = "tracks"."id"
					AND LOWER("languages"."code") = 'zxx'
			)
		`);
	}
}
