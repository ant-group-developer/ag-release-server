import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1770450940460 implements MigrationInterface {
    name = 'Migration1770450940460'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" ADD "prefix_key_bucket_metadata_ci" character varying(200)`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."prefix_key_bucket_metadata_ci" IS 'Prefix folder metadata CI trên bucket (ví dụ: releases/{releaseId}/release_metadata_ci/)'`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "prefix_key_bucket_metadata_spotify" character varying(200)`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."prefix_key_bucket_metadata_spotify" IS 'Prefix folder metadata Spotify trên bucket (ví dụ: releases/{releaseId}/release_metadata_spotify/)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."prefix_key_bucket_metadata_spotify" IS 'Prefix folder metadata Spotify trên bucket (ví dụ: releases/{releaseId}/release_metadata_spotify/)'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "prefix_key_bucket_metadata_spotify"`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."prefix_key_bucket_metadata_ci" IS 'Prefix folder metadata CI trên bucket (ví dụ: releases/{releaseId}/release_metadata_ci/)'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "prefix_key_bucket_metadata_ci"`);
    }

}
