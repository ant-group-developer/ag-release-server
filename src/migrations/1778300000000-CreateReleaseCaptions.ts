import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseCaptions1778300000000
	implements MigrationInterface
{
	name = 'CreateReleaseCaptions1778300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" DROP COLUMN IF EXISTS "subtitles"`,
		);
		await queryRunner.query(`
			CREATE TABLE "release_captions" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"language_id" uuid NOT NULL,
				"type" character varying(20) NOT NULL DEFAULT 'CAPTION',
				"file_id" uuid NOT NULL,
				CONSTRAINT "PK_release_captions_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_release_captions_release_id_language_id_type" UNIQUE ("release_id", "language_id", "type")
			)
		`);
		await queryRunner.query(`
			ALTER TABLE "release_captions"
			ADD CONSTRAINT "FK_release_captions_release_id"
			FOREIGN KEY ("release_id") REFERENCES "releases"("id")
			ON DELETE CASCADE ON UPDATE NO ACTION
		`);
		await queryRunner.query(`
			ALTER TABLE "release_captions"
			ADD CONSTRAINT "FK_release_captions_language_id"
			FOREIGN KEY ("language_id") REFERENCES "languages"("id")
			ON DELETE RESTRICT ON UPDATE NO ACTION
		`);
		await queryRunner.query(`
			ALTER TABLE "release_captions"
			ADD CONSTRAINT "FK_release_captions_file_id"
			FOREIGN KEY ("file_id") REFERENCES "files"("id")
			ON DELETE NO ACTION ON UPDATE NO ACTION
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_release_captions_file_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_release_captions_language_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_release_captions_release_id"`,
		);
		await queryRunner.query(`DROP TABLE "release_captions"`);
		await queryRunner.query(
			`ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "subtitles" jsonb`,
		);
	}
}
