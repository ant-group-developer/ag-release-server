import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778221610081 implements MigrationInterface {
    name = 'Migration1778221610081'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "request_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "method" character varying NOT NULL, "url" character varying NOT NULL, "route" character varying NOT NULL, "ip" character varying, "user_agent" character varying, "headers" jsonb, "body" jsonb, "query" jsonb, "params" jsonb, "user_id" character varying, "user_role" character varying, "status_code" integer, "response_body" jsonb, "error_message" character varying, "error_name" character varying, "error_stack" text, "error_cause" jsonb, "duration" double precision, CONSTRAINT "PK_1edd3815ae37a9b9511f5a26dca" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "logs" ALTER COLUMN "type" SET DEFAULT 'BUSINESS'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" ALTER COLUMN "type" SET DEFAULT 'SYSTEM'`);
        await queryRunner.query(`DROP TABLE "request_logs"`);
    }

}
