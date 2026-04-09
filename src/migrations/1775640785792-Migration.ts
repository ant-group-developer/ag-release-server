import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775640785792 implements MigrationInterface {
    name = 'Migration1775640785792'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "delivery_email" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "delivery_email_subject" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "manual_upload_url" character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "manual_upload_url"`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "delivery_email_subject"`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "delivery_email"`);
    }

}
