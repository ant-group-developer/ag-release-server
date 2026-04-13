import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775697640503 implements MigrationInterface {
    name = 'Migration1775697640503'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."release_execution_steps_step_type_enum" RENAME TO "release_execution_steps_step_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."release_execution_steps_step_type_enum" AS ENUM('GENERATE_UPC', 'GENERATE_ISRC', 'CREATE_METADATA_ERN', 'CREATE_METADATA_CI', 'UPLOAD_SFTP_CI', 'CREATE_DONE_FOLDER', 'UPLOAD_SFTP', 'EXPORT_EXCEL', 'SEND_EMAIL_EXPORT', 'WAITING_EXPORT', 'CLEANUP')`);

        // Cast column to text so we can update freely
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "step_type" TYPE text USING "step_type"::text`);

        // Migrate old enum values to new ones
        await queryRunner.query(`UPDATE "release_execution_steps" SET "step_type" = 'CREATE_METADATA_ERN' WHERE "step_type" = 'CREATE_METADATA'`);
        await queryRunner.query(`UPDATE "release_execution_steps" SET "step_type" = 'CREATE_DONE_FOLDER' WHERE "step_type" = 'POST_UPLOAD_HOOK'`);
        await queryRunner.query(`UPDATE "release_execution_steps" SET "step_type" = 'SEND_EMAIL_EXPORT' WHERE "step_type" = 'SEND_EMAIL'`);

        // Cast back to new enum
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "step_type" TYPE "public"."release_execution_steps_step_type_enum" USING "step_type"::"public"."release_execution_steps_step_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution_steps_step_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ALTER COLUMN "dsp_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ALTER COLUMN "dsp_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TYPE "public"."release_execution_steps_step_type_enum_old" AS ENUM('CREATE_METADATA', 'UPLOAD_SFTP', 'POST_UPLOAD_HOOK', 'EXPORT_EXCEL', 'SEND_EMAIL', 'WAITING_EXPORT', 'CLEANUP')`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "step_type" TYPE "public"."release_execution_steps_step_type_enum_old" USING "step_type"::"text"::"public"."release_execution_steps_step_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution_steps_step_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."release_execution_steps_step_type_enum_old" RENAME TO "release_execution_steps_step_type_enum"`);
    }

}
