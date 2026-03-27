import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774598075238 implements MigrationInterface {
    name = 'Migration1774598075238'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" ADD "direct_ddex_on_server" character varying(200)`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "ddex_version" character varying(200)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "ddex_version"`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "direct_ddex_on_server"`);
    }

}
