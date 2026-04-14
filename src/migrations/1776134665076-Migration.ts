import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776134665076 implements MigrationInterface {
    name = 'Migration1776134665076'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Tables - use IF NOT EXISTS
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "release_executions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" uuid NOT NULL, "type" "public"."release_executions_type_enum" NOT NULL, "status" "public"."release_executions_status_enum" NOT NULL DEFAULT 'QUEUED', "original_dsp_codes" character varying array, "triggered_by_id" uuid, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "summary" text, CONSTRAINT "PK_1cf530912fdbcd741200d945680" PRIMARY KEY ("id"))`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."release_id" IS 'ID của Release đang được phân phối'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."type" IS 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."status" IS 'Trạng thái tổng thể của nguyên đợt phân phối này'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."original_dsp_codes" IS 'Mảng lưu lại danh sách Dsp Codes lúc submit để history đối chiếu'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."triggered_by_id" IS 'ID của admin bấm nút submit (để trace)'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."started_at" IS 'Thời gian Worker bắt đầu gắp job này ra xử lý'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."completed_at" IS 'Thời gian hoàn tất xử lý tất cả các DSP'`);
        await queryRunner.query(`COMMENT ON COLUMN "release_executions"."summary" IS 'Báo cáo tổng hợp/Ghi chú lỗi nếu quá trình tổng thể bị văng'`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "release_execution_dsps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "execution_id" uuid NOT NULL, "dsp_id" character varying(10), "status" "public"."release_execution_dsps_status_enum" NOT NULL DEFAULT 'QUEUED', "logs" text, CONSTRAINT "PK_02861d4bf7fc7a0f1841a48c885" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "release_execution_steps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "execution_dsp_id" uuid NOT NULL, "step_type" "public"."release_execution_steps_step_type_enum" NOT NULL, "status" "public"."release_execution_steps_status_enum" NOT NULL DEFAULT 'PENDING', "order" integer NOT NULL DEFAULT '0', "aggregator_id" uuid, "logs" text, "metadata" jsonb, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "completed_by" uuid, "retry_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_4831b174408a0d2d796e43cc768" PRIMARY KEY ("id"))`);

        // Add columns - guard with IF NOT EXISTS
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aggregators' AND column_name = 'delivery_email') THEN ALTER TABLE "aggregators" ADD "delivery_email" character varying(50); END IF; END $$`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aggregators' AND column_name = 'delivery_email_subject') THEN ALTER TABLE "aggregators" ADD "delivery_email_subject" character varying(500); END IF; END $$`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aggregators' AND column_name = 'manual_upload_url') THEN ALTER TABLE "aggregators" ADD "manual_upload_url" character varying(500); END IF; END $$`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dsps' AND column_name = 'has_deal') THEN ALTER TABLE "dsps" ADD "has_deal" boolean NOT NULL DEFAULT false; END IF; END $$`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."has_deal" IS 'Đánh dấu có deal với CI hay chưa'`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backups' AND column_name = 'url_r2') THEN ALTER TABLE "backups" ADD "url_r2" character varying(255); END IF; END $$`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_r2" IS 'URL file backup trên Cloudflare R2'`);
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'backups' AND column_name = 'url_folder_r2') THEN ALTER TABLE "backups" ADD "url_folder_r2" character varying(255); END IF; END $$`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_folder_r2" IS 'Thư mục lưu backup trên Cloudflare R2'`);

        // Releases status enum - only alter if old values still exist
        await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'issues' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'releases_status_enum')) THEN
            ALTER TYPE "public"."releases_status_enum" RENAME TO "releases_status_enum_old";
            CREATE TYPE "public"."releases_status_enum" AS ENUM('draft', 'submitted', 'processing', 'awaiting_action', 'distributed', 'partially_failed', 'failed', 'taken_down', 'issues', 'never_distributed');
            ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT;
            ALTER TABLE "releases" ALTER COLUMN "status" TYPE "public"."releases_status_enum" USING "status"::"text"::"public"."releases_status_enum";
            ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft';
            DROP TYPE "public"."releases_status_enum_old";
            UPDATE "releases" SET "status" = 'failed' WHERE "status" = 'issues';
            UPDATE "releases" SET "status" = 'draft' WHERE "status" = 'never_distributed';
            ALTER TYPE "public"."releases_status_enum" RENAME TO "releases_status_enum_old";
            CREATE TYPE "public"."releases_status_enum" AS ENUM('draft', 'submitted', 'processing', 'awaiting_action', 'distributed', 'partially_failed', 'failed', 'taken_down');
            ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT;
            ALTER TABLE "releases" ALTER COLUMN "status" TYPE "public"."releases_status_enum" USING "status"::"text"::"public"."releases_status_enum";
            ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft';
            DROP TYPE "public"."releases_status_enum_old";
        END IF; END $$`);

        // Foreign keys - drop if exists then add
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT IF EXISTS "FK_4f470831591e6592e8050f4e6e6"`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_4f470831591e6592e8050f4e6e6" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT IF EXISTS "FK_1b6afbc3a589f4421295d5b351d"`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT IF EXISTS "FK_1dd921ba6b9c6e1ac4fe1c9f5ae"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_1dd921ba6b9c6e1ac4fe1c9f5ae" FOREIGN KEY ("execution_id") REFERENCES "release_executions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT IF EXISTS "FK_0385d4489ff1f43fd3c9fc50209"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT IF EXISTS "FK_bfdd175c275eab7b180b098da24"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_bfdd175c275eab7b180b098da24" FOREIGN KEY ("execution_dsp_id") REFERENCES "release_execution_dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT IF EXISTS "FK_0283caf7918d139912b05597f1b"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_0283caf7918d139912b05597f1b" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT IF EXISTS "FK_6c87c1d4e3268e0347dd2eb84e5"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_6c87c1d4e3268e0347dd2eb84e5" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_6c87c1d4e3268e0347dd2eb84e5"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_0283caf7918d139912b05597f1b"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_bfdd175c275eab7b180b098da24"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_1dd921ba6b9c6e1ac4fe1c9f5ae"`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d"`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_4f470831591e6592e8050f4e6e6"`);
        await queryRunner.query(`CREATE TYPE "public"."releases_status_enum_old" AS ENUM('distributed', 'draft', 'issues', 'never_distributed', 'processing', 'taken_down')`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" TYPE "public"."releases_status_enum_old" USING "status"::"text"::"public"."releases_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."releases_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."releases_status_enum_old" RENAME TO "releases_status_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_folder_r2" IS 'Thư mục lưu backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "backups" DROP COLUMN "url_folder_r2"`);
        await queryRunner.query(`COMMENT ON COLUMN "backups"."url_r2" IS 'URL file backup trên Cloudflare R2'`);
        await queryRunner.query(`ALTER TABLE "backups" DROP COLUMN "url_r2"`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."has_deal" IS 'Đánh dấu có deal với CI hay chưa'`);
        await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "has_deal"`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "manual_upload_url"`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "delivery_email_subject"`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "delivery_email"`);
        await queryRunner.query(`DROP TABLE "release_execution_steps"`);
        await queryRunner.query(`DROP TABLE "release_execution_dsps"`);
        await queryRunner.query(`DROP TABLE "release_executions"`);
    }

}
