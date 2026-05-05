import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubmitStepLogs1776913020559 implements MigrationInterface {
    name = 'AddSubmitStepLogs1776913020559'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_submit_step_logs_level_enum" AS ENUM('SUCCESS', 'LOG', 'ERROR', 'WARNING')`);
        await queryRunner.query(`CREATE TABLE "release_submit_step_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_submit_step_id" uuid, "level" "public"."release_submit_step_logs_level_enum" NOT NULL DEFAULT 'LOG', "message" text, "data" jsonb, CONSTRAINT "PK_4a757d447151a68aae5e1b94347" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" ADD CONSTRAINT "FK_bf950b310113077973dc74e35a5" FOREIGN KEY ("release_submit_step_id") REFERENCES "release_submit_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" DROP CONSTRAINT "FK_bf950b310113077973dc74e35a5"`);
        await queryRunner.query(`DROP TABLE "release_submit_step_logs"`);
        await queryRunner.query(`DROP TYPE "public"."release_submit_step_logs_level_enum"`);
    }

}
