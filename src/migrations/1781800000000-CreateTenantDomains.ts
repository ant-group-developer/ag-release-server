import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantDomains1781800000000 implements MigrationInterface {
	name = 'CreateTenantDomains1781800000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TYPE "public"."domain_status_enum" AS ENUM
				('pending', 'verifying', 'active', 'failed', 'expired')
		`);

		await queryRunner.query(`
			CREATE TYPE "public"."ssl_status_enum" AS ENUM
				('pending', 'initializing', 'active', 'failed')
		`);

		await queryRunner.query(`
			CREATE TYPE "public"."domain_setup_mode_enum" AS ENUM
				('cloudflare_auto', 'manual')
		`);

		await queryRunner.query(`
			CREATE TABLE "tenant_domains" (
				"id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
				"created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
				"updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
				"creator_id"            UUID,
				"modifier_id"           UUID,
				"domain"                VARCHAR(253) NOT NULL,
				"tenant_id"             UUID NOT NULL,
				"status"                "public"."domain_status_enum" NOT NULL DEFAULT 'pending',
				"setup_mode"            "public"."domain_setup_mode_enum" NOT NULL DEFAULT 'manual',
				"cf_custom_hostname_id" VARCHAR(255),
				"ssl_status"            "public"."ssl_status_enum" NOT NULL DEFAULT 'pending',
				"cf_tenant_zone_id"     VARCHAR(255),
				"verification_token"    VARCHAR(512),
				"verified_at"           TIMESTAMP,
				"ssl_active_at"         TIMESTAMP,
				"last_checked_at"       TIMESTAMP,
				"last_check_result"     JSONB,
				CONSTRAINT "UQ_tenant_domains_domain"    UNIQUE ("domain"),
				CONSTRAINT "UQ_tenant_domains_tenant_id" UNIQUE ("tenant_id"),
				CONSTRAINT "PK_tenant_domains" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			COMMENT ON TABLE "tenant_domains" IS 'Custom domain của từng tenant'
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_tenant_domains_tenant_id" ON "tenant_domains" ("tenant_id")
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_tenant_domains_domain" ON "tenant_domains" ("domain")
		`);

		await queryRunner.query(`
			CREATE INDEX "IDX_tenant_domains_status" ON "tenant_domains" ("status")
		`);

		await queryRunner.query(`
			ALTER TABLE "tenant_domains"
				ADD CONSTRAINT "FK_tenant_domains_tenant_id"
				FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "tenant_domains" DROP CONSTRAINT "FK_tenant_domains_tenant_id"`);
		await queryRunner.query(`DROP INDEX "IDX_tenant_domains_status"`);
		await queryRunner.query(`DROP INDEX "IDX_tenant_domains_domain"`);
		await queryRunner.query(`DROP INDEX "IDX_tenant_domains_tenant_id"`);
		await queryRunner.query(`DROP TABLE "tenant_domains"`);
		await queryRunner.query(`DROP TYPE "public"."domain_setup_mode_enum"`);
		await queryRunner.query(`DROP TYPE "public"."ssl_status_enum"`);
		await queryRunner.query(`DROP TYPE "public"."domain_status_enum"`);
	}
}
