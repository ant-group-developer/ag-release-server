import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateRetryCount1775701616318 implements MigrationInterface {
    name = 'UpdateRetryCount1775701616318'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '3'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" ALTER COLUMN "retry_count" SET DEFAULT '0'`);
    }

}
