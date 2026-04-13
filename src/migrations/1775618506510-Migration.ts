import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775618506510 implements MigrationInterface {
    name = 'Migration1775618506510'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_4f470831591e6592e8050f4e6e6"`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d"`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."release_id" IS 'ID của Release đang được phân phối'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."type" IS 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."status" IS 'Trạng thái tổng thể của nguyên đợt phân phối này'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."original_dsp_codes" IS 'Mảng lưu lại danh sách Dsp Codes lúc submit để history đối chiếu'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."triggered_by_id" IS 'ID của admin bấm nút submit (để trace)'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."started_at" IS 'Thời gian Worker bắt đầu gắp job này ra xử lý'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."completed_at" IS 'Thời gian hoàn tất xử lý tất cả các DSP'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."summary" IS 'Báo cáo tổng hợp/Ghi chú lỗi nếu quá trình tổng thể bị văng'`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_4f470831591e6592e8050f4e6e6" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d"`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_4f470831591e6592e8050f4e6e6"`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."summary" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."completed_at" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."started_at" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."triggered_by_id" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."original_dsp_codes" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."status" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."type" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."release_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_4f470831591e6592e8050f4e6e6" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
