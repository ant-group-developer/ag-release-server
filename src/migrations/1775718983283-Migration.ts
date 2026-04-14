import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775718983283 implements MigrationInterface {
    name = "Migration1775718983283";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Step 1: Rename old enum
        await queryRunner.query(`
            ALTER TYPE "public"."releases_status_enum" RENAME TO "releases_status_enum_old"
        `);

        // Step 2: Create new enum (include old values 'issues' and 'never_distributed'
        // temporarily so the USING cast works)
        await queryRunner.query(`
            CREATE TYPE "public"."releases_status_enum" AS ENUM(
                'draft',
                'submitted',
                'processing',
                'awaiting_action',
                'distributed',
                'partially_failed',
                'failed',
                'taken_down',
                'issues',
                'never_distributed'
            )
        `);

        // Step 3: Swap column to new enum
        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT
        `);

        await queryRunner.query(`
            ALTER TABLE "releases"
            ALTER COLUMN "status"
            TYPE "public"."releases_status_enum"
            USING "status"::text::"public"."releases_status_enum"
        `);

        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'
        `);

        // Step 4: Drop old enum
        await queryRunner.query(`
            DROP TYPE "public"."releases_status_enum_old"
        `);

        // Step 5: Now migrate data (column uses new enum that has all values)
        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'failed'
            WHERE "status" = 'issues'
        `);

        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'draft'
            WHERE "status" = 'never_distributed'
        `);

        // Step 6: Remove deprecated enum values by recreating the enum without them
        await queryRunner.query(`
            ALTER TYPE "public"."releases_status_enum" RENAME TO "releases_status_enum_old"
        `);

        await queryRunner.query(`
            CREATE TYPE "public"."releases_status_enum" AS ENUM(
                'draft',
                'submitted',
                'processing',
                'awaiting_action',
                'distributed',
                'partially_failed',
                'failed',
                'taken_down'
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT
        `);

        await queryRunner.query(`
            ALTER TABLE "releases"
            ALTER COLUMN "status"
            TYPE "public"."releases_status_enum"
            USING "status"::text::"public"."releases_status_enum"
        `);

        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'
        `);

        await queryRunner.query(`
            DROP TYPE "public"."releases_status_enum_old"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'issues'
            WHERE "status" = 'failed'
        `);

        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'never_distributed'
            WHERE "status" = 'draft'
        `);

        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'draft'
            WHERE "status" IN ('submitted', 'awaiting_action')
        `);

        await queryRunner.query(`
            UPDATE "releases"
            SET "status" = 'issues'
            WHERE "status" IN ('partially_failed')
        `);

        await queryRunner.query(`
            CREATE TYPE "public"."releases_status_enum_old" AS ENUM(
                'distributed',
                'draft',
                'issues',
                'never_distributed',
                'processing',
                'taken_down'
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" DROP DEFAULT
        `);

        await queryRunner.query(`
            ALTER TABLE "releases"
            ALTER COLUMN "status"
            TYPE "public"."releases_status_enum_old"
            USING "status"::text::"public"."releases_status_enum_old"
        `);

        await queryRunner.query(`
            ALTER TABLE "releases" ALTER COLUMN "status" SET DEFAULT 'draft'
        `);

        await queryRunner.query(`
            DROP TYPE "public"."releases_status_enum"
        `);

        await queryRunner.query(`
            ALTER TYPE "public"."releases_status_enum_old" RENAME TO "releases_status_enum"
        `);
    }
}