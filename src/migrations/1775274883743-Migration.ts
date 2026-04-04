import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775274883743 implements MigrationInterface {
    name = 'Migration1775274883743'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" ADD "is_sent_metadata_ci" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."is_sent_metadata_ci" IS 'Đánh dấu metadata đã được gửi sang CI Aggregator chung một mẻ chưa'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "releases"."is_sent_metadata_ci" IS 'Đánh dấu metadata đã được gửi sang CI Aggregator chung một mẻ chưa'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "is_sent_metadata_ci"`);
    }

}
