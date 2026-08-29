import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChannelTenantTransfer1786300000000 implements MigrationInterface {
	name = 'ChannelTenantTransfer1786300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "channel_histories"
			ADD COLUMN IF NOT EXISTS "effective_date" date,
			ADD COLUMN IF NOT EXISTS "revenue_effective_from" date,
			ADD COLUMN IF NOT EXISTS "from_tenant_id" uuid,
			ADD COLUMN IF NOT EXISTS "to_tenant_id" uuid
		`);
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_videos_channel_id"
			ON "videos" ("channel_id")
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_videos_channel_id"`);
		await queryRunner.query(`
			ALTER TABLE "channel_histories"
			DROP COLUMN IF EXISTS "effective_date",
			DROP COLUMN IF EXISTS "revenue_effective_from",
			DROP COLUMN IF EXISTS "from_tenant_id",
			DROP COLUMN IF EXISTS "to_tenant_id"
		`);
	}
}
