import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775551991006 implements MigrationInterface {
    name = 'Migration1775551991006'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_execution_steps_step_type_enum" AS ENUM('CREATE_METADATA', 'UPLOAD_SFTP', 'POST_UPLOAD_HOOK', 'EXPORT_EXCEL', 'SEND_EMAIL', 'WAITING_EXPORT', 'CLEANUP')`);
        await queryRunner.query(`CREATE TYPE "public"."release_execution_steps_status_enum" AS ENUM('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'WAITING_ACTION', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "release_execution_steps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "execution_dsp_id" uuid NOT NULL, "step_type" "public"."release_execution_steps_step_type_enum" NOT NULL, "status" "public"."release_execution_steps_status_enum" NOT NULL DEFAULT 'PENDING', "sort_order" integer NOT NULL DEFAULT '0', "aggregator_id" uuid, "logs" text, "metadata" jsonb, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "completed_by" uuid, "retry_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_4831b174408a0d2d796e43cc768" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."release_execution_dsps_status_enum" AS ENUM('QUEUED', 'RUNNING', 'AWAITING_ACTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "release_execution_dsps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "execution_id" uuid NOT NULL, "dsp_id" character varying(10) NOT NULL, "status" "public"."release_execution_dsps_status_enum" NOT NULL DEFAULT 'QUEUED', "logs" text, CONSTRAINT "PK_02861d4bf7fc7a0f1841a48c885" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."release_executions_type_enum" AS ENUM('INITIAL_RELEASE', 'UPDATE', 'TAKEDOWN', 'RETRY')`);
        await queryRunner.query(`CREATE TYPE "public"."release_executions_status_enum" AS ENUM('QUEUED', 'RUNNING', 'AWAITING_ACTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "release_executions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" uuid NOT NULL, "type" "public"."release_executions_type_enum" NOT NULL, "status" "public"."release_executions_status_enum" NOT NULL DEFAULT 'QUEUED', "original_dsp_codes" character varying array, "triggered_by_id" uuid, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "summary" text, CONSTRAINT "PK_1cf530912fdbcd741200d945680" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "dsps" ADD "has_deal" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."has_deal" IS 'Đánh dấu có deal với CI hay chưa'`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_bfdd175c275eab7b180b098da24" FOREIGN KEY ("execution_dsp_id") REFERENCES "release_execution_dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_0283caf7918d139912b05597f1b" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ADD CONSTRAINT "FK_6c87c1d4e3268e0347dd2eb84e5" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_1dd921ba6b9c6e1ac4fe1c9f5ae" FOREIGN KEY ("execution_id") REFERENCES "release_executions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" ADD CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_4f470831591e6592e8050f4e6e6" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_executions" ADD CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_1b6afbc3a589f4421295d5b351d"`);
        await queryRunner.query(`ALTER TABLE "release_executions" DROP CONSTRAINT "FK_4f470831591e6592e8050f4e6e6"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_0385d4489ff1f43fd3c9fc50209"`);
        await queryRunner.query(`ALTER TABLE "release_execution_dsps" DROP CONSTRAINT "FK_1dd921ba6b9c6e1ac4fe1c9f5ae"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_6c87c1d4e3268e0347dd2eb84e5"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_0283caf7918d139912b05597f1b"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps" DROP CONSTRAINT "FK_bfdd175c275eab7b180b098da24"`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."has_deal" IS 'Đánh dấu có deal với CI hay chưa'`);
        await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "has_deal"`);
        await queryRunner.query(`DROP TABLE "release_executions"`);
        await queryRunner.query(`DROP TYPE "public"."release_executions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."release_executions_type_enum"`);
        await queryRunner.query(`DROP TABLE "release_execution_dsps"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution_dsps_status_enum"`);
        await queryRunner.query(`DROP TABLE "release_execution_steps"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution_steps_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution_steps_step_type_enum"`);
    }

}
