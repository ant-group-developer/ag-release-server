import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777365680068 implements MigrationInterface {
    name = 'Migration1777365680068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."releases_status_enum" RENAME TO "releases_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."releases_status_enum" AS ENUM('draft', 'submitted', 'processing', 'awaiting_action', 'distributed', 'partial_done', 'failed', 'taken_down')`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" TYPE "public"."releases_status_enum" USING (CASE WHEN "status"::text = 'partially_failed' THEN 'partial_done' ELSE "status"::text END)::"public"."releases_status_enum"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."releases_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."releases_status_enum_old" AS ENUM('awaiting_action', 'distributed', 'draft', 'failed', 'partially_failed', 'processing', 'submitted', 'taken_down')`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" TYPE "public"."releases_status_enum_old" USING "status"::"text"::"public"."releases_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."releases_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."releases_status_enum_old" RENAME TO "releases_status_enum"`);
    }

}
