import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775017406876 implements MigrationInterface {
    name = 'Migration1775017406876'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "ddex_version"`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" DROP COLUMN "ern_version"`);
        await queryRunner.query(`ALTER TABLE "sftp_configs" ADD "ern_version" character varying(10) DEFAULT '3.8.2'`);
        await queryRunner.query(`COMMENT ON COLUMN "sftp_configs"."ern_version" IS 'DDEX ERN version (e.g. 3.8.2, 4.3)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "sftp_configs"."ern_version" IS 'DDEX ERN version (e.g. 3.8.2, 4.3)'`);
        await queryRunner.query(`ALTER TABLE "sftp_configs" DROP COLUMN "ern_version"`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" ADD "ern_version" character varying(10) DEFAULT '3.8.2'`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "ddex_version" character varying(200)`);
    }

}
