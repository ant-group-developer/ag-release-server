import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776224837915 implements MigrationInterface {
    name = 'Migration1776224837915'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "files"
            ALTER COLUMN "file_name" TYPE character varying(515)
        `);

        await queryRunner.query(`
            ALTER TABLE "files"
            ALTER COLUMN "key" TYPE character varying(500)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "files"
            ALTER COLUMN "key" TYPE character varying(200)
        `);

        await queryRunner.query(`
            ALTER TABLE "files"
            ALTER COLUMN "file_name" TYPE character varying(115)
        `);
    }
}