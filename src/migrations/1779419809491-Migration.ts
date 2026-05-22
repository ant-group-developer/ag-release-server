import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779419809491 implements MigrationInterface {
    name = 'Migration1779419809491'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_3e8f38488673a921d0170e0c4fe"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP COLUMN "aggregator_id"`);
        await queryRunner.query(`ALTER TYPE "public"."tenant_dsp_agreements_mode_enum" RENAME TO "tenant_dsp_agreements_mode_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_dsp_agreements_mode_enum" AS ENUM('SYSTEM', 'DIRECT')`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" TYPE "public"."tenant_dsp_agreements_mode_enum" USING "mode"::"text"::"public"."tenant_dsp_agreements_mode_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" SET DEFAULT 'SYSTEM'`);
        await queryRunner.query(`DROP TYPE "public"."tenant_dsp_agreements_mode_enum_old"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" SET DEFAULT 'SYSTEM'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" DROP DEFAULT`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_dsp_agreements_mode_enum_old" AS ENUM('aggregator', 'direct', 'system')`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ALTER COLUMN "mode" TYPE "public"."tenant_dsp_agreements_mode_enum_old" USING "mode"::"text"::"public"."tenant_dsp_agreements_mode_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_dsp_agreements_mode_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tenant_dsp_agreements_mode_enum_old" RENAME TO "tenant_dsp_agreements_mode_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD "aggregator_id" uuid`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_3e8f38488673a921d0170e0c4fe" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
