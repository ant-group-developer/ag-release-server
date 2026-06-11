import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToChannels1781085000000
	implements MigrationInterface
{
	name = 'AddTenantIdToChannels1781085000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "channels" ADD "tenant_id" uuid`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."tenant_id" IS 'ID tenant so huu channel'`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_channels_tenant_id" ON "channels" ("tenant_id")`,
		);
		await queryRunner.query(`
			ALTER TABLE "channels"
			ADD CONSTRAINT "FK_channels_tenant_id_tenants"
			FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
			ON DELETE NO ACTION ON UPDATE NO ACTION
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "channels" DROP CONSTRAINT "FK_channels_tenant_id_tenants"`,
		);
		await queryRunner.query(`DROP INDEX "public"."IDX_channels_tenant_id"`);
		await queryRunner.query(
			`ALTER TABLE "channels" DROP COLUMN "tenant_id"`,
		);
	}
}
