import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1770715644568 implements MigrationInterface {
    name = 'Migration1770715644568'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" RENAME COLUMN "prefix_key_bucket_metadata_spotify" TO "metadata_spotify"`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "metadata_spotify"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "metadata_spotify" jsonb`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."metadata_spotify" IS 'Metadata spotify'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."metadata_spotify" IS 'Metadata spotify'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "metadata_spotify"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "metadata_spotify" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "releases" RENAME COLUMN "metadata_spotify" TO "prefix_key_bucket_metadata_spotify"`);
    }

}
