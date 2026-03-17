import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773746144866 implements MigrationInterface {
    name = 'Migration1773746144866'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."batch_import_logs_status_enum" AS ENUM('validating', 'validated', 'validation_failed', 'uploading', 'uploaded', 'creating', 'completed', 'failed')`);
        await queryRunner.query(`CREATE TABLE "batch_import_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "batch_id" character varying(50) NOT NULL, "tenant_code" character varying(50), "release_folder" character varying(50) NOT NULL, "status" "public"."batch_import_logs_status_enum" NOT NULL DEFAULT 'validating', "excel_data" jsonb, "storage_keys" jsonb, "errors" jsonb, CONSTRAINT "PK_bbd4d29d2490aed751b846739e1" PRIMARY KEY ("id")); COMMENT ON COLUMN "batch_import_logs"."batch_id" IS 'Batch folder name (e.g., 20251211111052955)'; COMMENT ON COLUMN "batch_import_logs"."tenant_code" IS 'Tenant code from folder name (e.g., antmusic)'; COMMENT ON COLUMN "batch_import_logs"."release_folder" IS 'Release folder name / UPC (e.g., 850080651003)'; COMMENT ON COLUMN "batch_import_logs"."status" IS 'Current processing status'; COMMENT ON COLUMN "batch_import_logs"."excel_data" IS 'Raw Excel data rows for auditing'; COMMENT ON COLUMN "batch_import_logs"."storage_keys" IS 'Array of uploaded storage file keys'; COMMENT ON COLUMN "batch_import_logs"."errors" IS 'Validation errors if any'`);
        await queryRunner.query(`COMMENT ON TABLE "batch_import_logs" IS 'Log table tracking each release import from SFTP batch'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON TABLE "batch_import_logs" IS NULL`);
        await queryRunner.query(`DROP TABLE "batch_import_logs"`);
        await queryRunner.query(`DROP TYPE "public"."batch_import_logs_status_enum"`);
    }

}
