import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1770623609705 implements MigrationInterface {
    name = 'Migration1770623609705'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" RENAME COLUMN "prefix_key_bucket_metadata_ci" TO "metadata_ci"`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "metadata_ci"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "metadata_ci" jsonb`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."metadata_ci" IS 'Metadata CI info: { prefixKeyBucket, batchId }'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."metadata_ci" IS 'Metadata CI info: { prefixKeyBucket, batchId }'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "metadata_ci"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "metadata_ci" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "releases" RENAME COLUMN "metadata_ci" TO "prefix_key_bucket_metadata_ci"`);
    }

}
