import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777443047337 implements MigrationInterface {
    name = 'Migration1777443047337'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."release_submits_status_enum" RENAME TO "release_submits_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."release_submits_status_enum" AS ENUM('NEW', 'PROCESSING', 'WAITING_ACTION', 'PARTIAL_DONE', 'DONE', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" TYPE "public"."release_submits_status_enum" USING "status"::"text"::"public"."release_submits_status_enum"`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" SET DEFAULT 'NEW'`);
        await queryRunner.query(`DROP TYPE "public"."release_submits_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."release_submits_status_enum_old" AS ENUM('DONE', 'FAILED', 'NEW', 'PARTIAL_DONE', 'PROCESSING', 'WAITING_ACTION')`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" TYPE "public"."release_submits_status_enum_old" USING "status"::"text"::"public"."release_submits_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "release_submits" ALTER COLUMN "status" SET DEFAULT 'NEW'`);
        await queryRunner.query(`DROP TYPE "public"."release_submits_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."release_submits_status_enum_old" RENAME TO "release_submits_status_enum"`);
    }

}
