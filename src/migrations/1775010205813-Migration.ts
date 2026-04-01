import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775010205813 implements MigrationInterface {
    name = 'Migration1775010205813'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD "metadata_path" text`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."metadata_path" IS 'Đường dẫn folder metadata trên server cho lần delivery này'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD "batch_id" character varying(50)`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."batch_id" IS 'Batch ID của lần delivery này'`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD "delivery_id" uuid`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "creates_done_folder" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."creates_done_folder" IS 'Tạo folder .done trên SFTP sau khi upload xong (CI aggregator cần)'`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" ADD "ern_version" character varying(10) DEFAULT '3.8.2'`);
        await queryRunner.query(`COMMENT ON COLUMN "dsp_routing_configs"."ern_version" IS 'DDEX ERN version (e.g. 3.8.2, 4.3)'`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_7f7f2708587de78fb9220dd3c5e" FOREIGN KEY ("delivery_id") REFERENCES "release_dsp_delivery"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_7f7f2708587de78fb9220dd3c5e"`);
        await queryRunner.query(`COMMENT ON COLUMN "dsp_routing_configs"."ern_version" IS 'DDEX ERN version (e.g. 3.8.2, 4.3)'`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" DROP COLUMN "ern_version"`);
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."creates_done_folder" IS 'Tạo folder .done trên SFTP sau khi upload xong (CI aggregator cần)'`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "creates_done_folder"`);
        await queryRunner.query(`ALTER TABLE "release_logs" DROP COLUMN "delivery_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."batch_id" IS 'Batch ID của lần delivery này'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP COLUMN "batch_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."metadata_path" IS 'Đường dẫn folder metadata trên server cho lần delivery này'`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP COLUMN "metadata_path"`);
    }

}
