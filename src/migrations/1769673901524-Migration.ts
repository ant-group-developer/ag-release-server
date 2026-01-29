import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1769673901524 implements MigrationInterface {
    name = 'Migration1769673901524'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "dsp_release_status" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dsp_id" character varying NOT NULL, "release_id" character varying NOT NULL, "status" "public"."dsp_release_status_status_enum" NOT NULL DEFAULT 'draft', CONSTRAINT "PK_82477ab030c8f549e8c53d3ad69" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_48cce8c8e9830e5a732b3ad39a" ON "dsp_release_status" ("dsp_id", "release_id") `);
        await queryRunner.query(`CREATE TABLE "delivery_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(255) NOT NULL, "host" character varying NOT NULL, "port" character varying NOT NULL, "username" character varying NOT NULL, "password" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_77a39b50899362bc5a0867c6b94" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a132ab33e1fe4d45c71b6a7565" ON "delivery_configs" ("name") `);
        await queryRunner.query(`CREATE TABLE "dsp_routing_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dsp_id" character varying NOT NULL, "mode" "public"."dsp_routing_settings_mode_enum" NOT NULL DEFAULT 'AGGREGATOR', "direct_config_id" uuid, "specific_aggregator_config_id" uuid, CONSTRAINT "UQ_0fcbe8564f1279962242a5b51fb" UNIQUE ("dsp_id"), CONSTRAINT "REL_0fcbe8564f1279962242a5b51f" UNIQUE ("dsp_id"), CONSTRAINT "PK_331f2a3188b013fc3feff281f78" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "system_settings" ("key" character varying(100) NOT NULL, "value" text, "description" text, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b1b5bc664526d375c94ce9ad43d" PRIMARY KEY ("key"))`);
        await queryRunner.query(`ALTER TABLE "aggregators" ADD "dsp_usage_count" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."dsp_usage_count" IS 'Số lần sử dụng DSP'`);
        await queryRunner.query(`ALTER TABLE "dsp_release_status" ADD CONSTRAINT "FK_1d92d17d0d046106603141c4ae8" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_0fcbe8564f1279962242a5b51fb" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_c4725f00b83e27ec72727f95e65" FOREIGN KEY ("direct_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_c5503ee2087c9811a96bf740631" FOREIGN KEY ("specific_aggregator_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_c5503ee2087c9811a96bf740631"`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_c4725f00b83e27ec72727f95e65"`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_0fcbe8564f1279962242a5b51fb"`);
        await queryRunner.query(`ALTER TABLE "dsp_release_status" DROP CONSTRAINT "FK_1d92d17d0d046106603141c4ae8"`);
        await queryRunner.query(`COMMENT ON COLUMN "aggregators"."dsp_usage_count" IS 'Số lần sử dụng DSP'`);
        await queryRunner.query(`ALTER TABLE "aggregators" DROP COLUMN "dsp_usage_count"`);
        await queryRunner.query(`DROP TABLE "system_settings"`);
        await queryRunner.query(`DROP TABLE "dsp_routing_settings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a132ab33e1fe4d45c71b6a7565"`);
        await queryRunner.query(`DROP TABLE "delivery_configs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_48cce8c8e9830e5a732b3ad39a"`);
        await queryRunner.query(`DROP TABLE "dsp_release_status"`);
    }

}
