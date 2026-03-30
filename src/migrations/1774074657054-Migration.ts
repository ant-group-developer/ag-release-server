import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774074657054 implements MigrationInterface {
    name = 'Migration1774074657054'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_logs_status_enum" AS ENUM('PENDING', 'SUCCESS', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "release_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" character varying NOT NULL, "logs" text, "status" "public"."release_logs_status_enum" NOT NULL DEFAULT 'PENDING', "step" character varying(100) NOT NULL, "releaseId" uuid, CONSTRAINT "PK_9461a88fc9dd2deb95bdb7c10ed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "logs"`);
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_c410149643acdb848695efb420e" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_c410149643acdb848695efb420e"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "logs" text`);
        await queryRunner.query(`DROP TABLE "release_logs"`);
        await queryRunner.query(`DROP TYPE "public"."release_logs_status_enum"`);
    }

}
