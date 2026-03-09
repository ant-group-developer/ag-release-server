import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1772850077899 implements MigrationInterface {
    name = 'Migration1772850077899'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "price_tiers" ADD "code" character varying(50)`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."code" IS 'Mã price tier (có thể null)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."code" IS 'Mã price tier (có thể null)'`);
        await queryRunner.query(`ALTER TABLE "price_tiers" DROP COLUMN "code"`);
    }

}
