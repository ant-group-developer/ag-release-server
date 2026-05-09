import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778209715086 implements MigrationInterface {
    name = 'Migration1778209715086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" ALTER COLUMN "type" SET DEFAULT 'BUSINESS'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" ALTER COLUMN "type" SET DEFAULT 'SYSTEM'`);
    }

}
