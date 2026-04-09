import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775701597813 implements MigrationInterface {
    name = 'Migration1775701597813'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '0'`);
    }

}
