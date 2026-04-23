import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776909074132 implements MigrationInterface {
    name = 'Migration1776909074132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_submit_steps_status_enum" AS ENUM('NEW', 'PROCESSING', 'WAITING_ACTION', 'DONE', 'FAILED', 'SKIPPED')`);
        await queryRunner.query(`CREATE TABLE "release_submit_steps" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_submit_id" uuid NOT NULL, "parent_step_id" uuid, "type" character varying(50) NOT NULL, "status" "public"."release_submit_steps_status_enum" NOT NULL DEFAULT 'NEW', "order" integer NOT NULL DEFAULT '0', "dsp_id" character varying(10), "dsp_ids" jsonb, "metadata" jsonb, "error_message" text, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "retry_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_3214f2b71699912527de9f47462" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."release_submits_status_enum" AS ENUM('NEW', 'PROCESSING', 'WAITING_ACTION', 'DONE', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "release_submits" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" uuid NOT NULL, "status" "public"."release_submits_status_enum" NOT NULL DEFAULT 'NEW', "metadata" jsonb, "completed_at" TIMESTAMP WITH TIME ZONE, "summary" text, CONSTRAINT "PK_3184f128556ac9a2f3823adf8b0" PRIMARY KEY ("id")); COMMENT ON COLUMN "release_submits"."metadata" IS 'Input data: releaseSnapshot, config, etc.'; COMMENT ON COLUMN "release_submits"."summary" IS 'Summary or error message'`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD CONSTRAINT "FK_b7018895dc67abbd9ae287fb189" FOREIGN KEY ("release_submit_id") REFERENCES "release_submits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD CONSTRAINT "FK_19bf0c34b01ed1a8c570290cd9a" FOREIGN KEY ("parent_step_id") REFERENCES "release_submit_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" ADD CONSTRAINT "FK_30b4b958ea9c6256d403784a3bc" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_submits" ADD CONSTRAINT "FK_4b27c04c587ebb60de313fa7954" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submits" DROP CONSTRAINT "FK_4b27c04c587ebb60de313fa7954"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP CONSTRAINT "FK_30b4b958ea9c6256d403784a3bc"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP CONSTRAINT "FK_19bf0c34b01ed1a8c570290cd9a"`);
        await queryRunner.query(`ALTER TABLE "release_submit_steps" DROP CONSTRAINT "FK_b7018895dc67abbd9ae287fb189"`);
        await queryRunner.query(`DROP TABLE "release_submits"`);
        await queryRunner.query(`DROP TYPE "public"."release_submits_status_enum"`);
        await queryRunner.query(`DROP TABLE "release_submit_steps"`);
        await queryRunner.query(`DROP TYPE "public"."release_submit_steps_status_enum"`);
    }

}
