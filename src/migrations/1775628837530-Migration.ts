import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775628837530 implements MigrationInterface {
    name = 'Migration1775628837530'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" RENAME COLUMN "sort_order" TO "order"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps" RENAME COLUMN "order" TO "sort_order"`);
    }

}
