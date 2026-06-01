import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780296792251 implements MigrationInterface {
    name = 'Migration1780296792251'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_video_artist_artist"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_video_artist_video"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_artist"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_artist_role"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_video_contributors_video"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "UQ_video_artist_artist_video"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "UQ_video_contributor_artist_role_video"`);
        await queryRunner.query(`COMMENT ON COLUMN "video_artist"."artist_id" IS 'ID nghe si tham gia video'`);
        await queryRunner.query(`COMMENT ON COLUMN "video_artist"."video_id" IS 'ID video'`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."artist_id" IS 'ID nghe si tham gia video'`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."artist_role_id" IS 'ID vai tro cua nghe si trong video'`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."video_id" IS 'ID video'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP CONSTRAINT "FK_44d483778e1900c779c41328142"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "album_format_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "UQ_1ecbe87b825aa1c5995ac9ad008" UNIQUE ("artist_id", "video_id")`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "UQ_003ae58f2c9a296e6ae6433d054" UNIQUE ("artist_id", "artist_role_id", "video_id")`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_c44e63bd171f37036dff4716b72" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_ea83525adf3fd916fac9fbd8ce4" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_946f90dc3cbe6b565c3377721f8" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_22102a4936eefef1aad771059f1" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_76c7fd55d2de6c6a427118b5ad2" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "releases" ADD CONSTRAINT "FK_44d483778e1900c779c41328142" FOREIGN KEY ("album_format_id") REFERENCES "album_formats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" DROP CONSTRAINT "FK_44d483778e1900c779c41328142"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_76c7fd55d2de6c6a427118b5ad2"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_22102a4936eefef1aad771059f1"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_946f90dc3cbe6b565c3377721f8"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_ea83525adf3fd916fac9fbd8ce4"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_c44e63bd171f37036dff4716b72"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "UQ_003ae58f2c9a296e6ae6433d054"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "UQ_1ecbe87b825aa1c5995ac9ad008"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "album_format_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "releases" ADD CONSTRAINT "FK_44d483778e1900c779c41328142" FOREIGN KEY ("album_format_id") REFERENCES "album_formats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."video_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."artist_role_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "video_contributors"."artist_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "video_artist"."video_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "video_artist"."artist_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "UQ_video_contributor_artist_role_video" UNIQUE ("artist_id", "artist_role_id", "video_id")`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "UQ_video_artist_artist_video" UNIQUE ("artist_id", "video_id")`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_artist_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_video_contributors_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_video_artist_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_video_artist_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
