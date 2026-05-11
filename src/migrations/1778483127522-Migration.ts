import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778483127522 implements MigrationInterface {
    name = 'Migration1778483127522'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "release_submits"
            ADD "release_title" character varying(255)
        `);

        await queryRunner.query(`
            ALTER TABLE "release_submits"
            ADD "release_upc" character varying(255)
        `);

        await queryRunner.query(`
            UPDATE "release_submits"
            SET
                "release_title" = LEFT(
                    COALESCE(metadata #>> '{input,releaseSnapshot,title}', ''),
                    255
                ),
                "release_upc" = LEFT(
                    COALESCE(metadata #>> '{input,releaseSnapshot,upc}', ''),
                    255
                )
        `);

        await queryRunner.query(`
            UPDATE "release_submits"
            SET "release_title" = 'UNKNOWN'
            WHERE "release_title" IS NULL OR "release_title" = ''
        `);

        await queryRunner.query(`
            UPDATE "release_submits"
            SET "release_upc" = 'UNKNOWN'
            WHERE "release_upc" IS NULL OR "release_upc" = ''
        `);

        await queryRunner.query(`
            ALTER TABLE "release_submits"
            ALTER COLUMN "release_title" SET NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "release_submits"
            ALTER COLUMN "release_upc" SET NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "release_submits"
            DROP COLUMN "release_upc"
        `);

        await queryRunner.query(`
            ALTER TABLE "release_submits"
            DROP COLUMN "release_title"
        `);
    }
}