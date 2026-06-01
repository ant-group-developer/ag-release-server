import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoArtistContributor1780246000000
	implements MigrationInterface
{
	name = 'AddVideoArtistContributor1780246000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "video_artist" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "artist_id" character varying(10) NOT NULL, "video_id" uuid NOT NULL, CONSTRAINT "UQ_video_artist_artist_video" UNIQUE ("artist_id", "video_id"), CONSTRAINT "PK_video_artist" PRIMARY KEY ("id"))`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "video_artist" IS 'Bang lien ket nghe si tham gia tung video'`,
		);
		await queryRunner.query(
			`CREATE TABLE "video_contributors" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "artist_id" character varying(10) NOT NULL, "artist_role_id" uuid NOT NULL, "video_id" uuid NOT NULL, CONSTRAINT "UQ_video_contributor_artist_role_video" UNIQUE ("artist_id", "artist_role_id", "video_id"), CONSTRAINT "PK_video_contributors" PRIMARY KEY ("id"))`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "video_contributors" IS 'Bang lien ket contributor tham gia tung video'`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_video_artist_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_video_artist_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_artist_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_video"`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_artist_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_video_artist_video"`,
		);
		await queryRunner.query(
			`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_video_artist_artist"`,
		);
		await queryRunner.query(`COMMENT ON TABLE "video_contributors" IS NULL`);
		await queryRunner.query(`DROP TABLE "video_contributors"`);
		await queryRunner.query(`COMMENT ON TABLE "video_artist" IS NULL`);
		await queryRunner.query(`DROP TABLE "video_artist"`);
	}
}
