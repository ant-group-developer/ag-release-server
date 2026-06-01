import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780328809916 implements MigrationInterface {
    name = 'Migration1780328809916'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_execution3_run_pipeline_queue_status_enum" AS ENUM('NEW', 'PROCESSING', 'DONE', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "release_execution3_run_pipeline_queue" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_execution_id" uuid NOT NULL, "status" "public"."release_execution3_run_pipeline_queue_status_enum" NOT NULL DEFAULT 'NEW', "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '3', "error" character varying, "started_at" TIMESTAMP, "completed_at" TIMESTAMP, CONSTRAINT "PK_0dfed50321a6a560572439a4032" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "release_execution3_run_pipeline_queue"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution3_run_pipeline_queue_status_enum"`);
    }

}
