import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773911094989 implements MigrationInterface {
    name = 'Migration1773911094989'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."batch_import_logs_status_enum" RENAME TO "batch_import_logs_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."batch_import_logs_status_enum" AS ENUM('validating', 'validated', 'validation_failed', 'uploading', 'uploaded', 'creating', 'completed', 'failed', 'skipped')`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" TYPE "public"."batch_import_logs_status_enum" USING "status"::"text"::"public"."batch_import_logs_status_enum"`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" SET DEFAULT 'validating'`);
        await queryRunner.query(`DROP TYPE "public"."batch_import_logs_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."batch_import_logs_status_enum_old" AS ENUM('validating', 'validated', 'validation_failed', 'uploading', 'uploaded', 'creating', 'completed', 'failed')`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" TYPE "public"."batch_import_logs_status_enum_old" USING "status"::"text"::"public"."batch_import_logs_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "batch_import_logs" ALTER COLUMN "status" SET DEFAULT 'validating'`);
        await queryRunner.query(`DROP TYPE "public"."batch_import_logs_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."batch_import_logs_status_enum_old" RENAME TO "batch_import_logs_status_enum"`);
    }

}
