import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779415287387 implements MigrationInterface {
    name = 'Migration1779415287387'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_dsp_agreements" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "dsp_id" character varying(10), "aggregator_id" uuid, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0e24ebe0a1a0a675ccacb701f6d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_dsp_routing_configs_mode_enum" AS ENUM('direct', 'aggregator', 'system')`);
        await queryRunner.query(`CREATE TABLE "tenant_dsp_routing_configs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_dsp_agreement_id" uuid NOT NULL, "sftp_config_id" uuid, "mode" "public"."tenant_dsp_routing_configs_mode_enum" NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "REL_a088a5c90616a911990822aac5" UNIQUE ("tenant_dsp_agreement_id"), CONSTRAINT "REL_442e5722bc700f9fa4cedb7939" UNIQUE ("sftp_config_id"), CONSTRAINT "PK_652690dbe5b6563f8990cd8c6d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "dsps" ADD "is_default" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."is_default" IS 'Có phải public hay ko'`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_db20d2e272ce8c16c7229bdd448" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_1542675f5af8c5f771752b8bae8" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" ADD CONSTRAINT "FK_3e8f38488673a921d0170e0c4fe" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_routing_configs" ADD CONSTRAINT "FK_a088a5c90616a911990822aac5d" FOREIGN KEY ("tenant_dsp_agreement_id") REFERENCES "tenant_dsp_agreements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_routing_configs" ADD CONSTRAINT "FK_442e5722bc700f9fa4cedb79392" FOREIGN KEY ("sftp_config_id") REFERENCES "sftp_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_dsp_routing_configs" DROP CONSTRAINT "FK_442e5722bc700f9fa4cedb79392"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_routing_configs" DROP CONSTRAINT "FK_a088a5c90616a911990822aac5d"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_3e8f38488673a921d0170e0c4fe"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_1542675f5af8c5f771752b8bae8"`);
        await queryRunner.query(`ALTER TABLE "tenant_dsp_agreements" DROP CONSTRAINT "FK_db20d2e272ce8c16c7229bdd448"`);
        await queryRunner.query(`COMMENT ON COLUMN "dsps"."is_default" IS 'Có phải public hay ko'`);
        await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "is_default"`);
        await queryRunner.query(`DROP TABLE "tenant_dsp_routing_configs"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_dsp_routing_configs_mode_enum"`);
        await queryRunner.query(`DROP TABLE "tenant_dsp_agreements"`);
    }

}
