import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773366332295 implements MigrationInterface {
    name = 'Migration1773366332295'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "release_dsp_delivery_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" uuid NOT NULL, "dsp_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "content" text, "level" character varying(50) NOT NULL DEFAULT 'ERROR', "metadata" json, CONSTRAINT "PK_aba80d6f0a698ecd75a8faef12f" PRIMARY KEY ("id")); COMMENT ON COLUMN "release_dsp_delivery_logs"."release_id" IS 'ID của release liên quan tới log giao DSP'; COMMENT ON COLUMN "release_dsp_delivery_logs"."dsp_id" IS 'ID của DSP nơi release được phân phối'; COMMENT ON COLUMN "release_dsp_delivery_logs"."title" IS 'Tiêu đề ngắn mô tả lỗi hoặc sự kiện'; COMMENT ON COLUMN "release_dsp_delivery_logs"."content" IS 'Nội dung chi tiết của lỗi hoặc thông tin log'; COMMENT ON COLUMN "release_dsp_delivery_logs"."level" IS 'Mức độ log: ERROR | WARNING | INFO'; COMMENT ON COLUMN "release_dsp_delivery_logs"."metadata" IS 'Dữ liệu bổ sung dạng JSON: request payload, response từ DSP, stack trace...'`);
        await queryRunner.query(`CREATE INDEX "IDX_d442887c32a5ec4e027afb7ef9" ON "release_dsp_delivery_logs" ("release_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7b8c5a2e7000180d5946d415f" ON "release_dsp_delivery_logs" ("dsp_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c7b8c5a2e7000180d5946d415f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d442887c32a5ec4e027afb7ef9"`);
        await queryRunner.query(`DROP TABLE "release_dsp_delivery_logs"`);
    }

}
