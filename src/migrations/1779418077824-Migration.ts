import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779418077824 implements MigrationInterface {
    name = 'Migration1779418077824'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_1542675f5af8c5f771752b8bae8"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD "sftp_config_id" uuid`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "UQ_9c99a8819b50ff6bf8f2ec16f6d" UNIQUE ("sftp_config_id")`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_dsp_agreements_mode_enum" AS ENUM('direct', 'aggregator', 'system')`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD "mode" "public"."tenant_dsp_agreements_mode_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "dsp_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "uq_tenant_dsp_agreement_tenant_dsp" UNIQUE ("tenant_id", "dsp_id")`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_1542675f5af8c5f771752b8bae8" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_9c99a8819b50ff6bf8f2ec16f6d" FOREIGN KEY ("sftp_config_id") REFERENCES "sftp_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_9c99a8819b50ff6bf8f2ec16f6d"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_1542675f5af8c5f771752b8bae8"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "uq_tenant_dsp_agreement_tenant_dsp"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "dsp_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP COLUMN "mode"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_dsp_agreements_mode_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "UQ_9c99a8819b50ff6bf8f2ec16f6d"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP COLUMN "sftp_config_id"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_1542675f5af8c5f771752b8bae8" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
