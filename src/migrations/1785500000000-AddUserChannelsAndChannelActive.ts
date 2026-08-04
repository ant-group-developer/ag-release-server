import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserChannelsAndChannelActive1785500000000
	implements MigrationInterface
{
	name = 'AddUserChannelsAndChannelActive1785500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Thêm cột is_active vào bảng channels
		await queryRunner.query(
			`ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."is_active" IS 'Trạng thái hoạt động của kênh'`,
		);

		// 2. Tạo bảng trung gian user_channels
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "user_channels" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"user_id" uuid NOT NULL,
				"channel_id" uuid NOT NULL,
				"tenant_id" uuid NOT NULL,
				"creator_id" uuid,
				"modifier_id" uuid,
				CONSTRAINT "PK_user_channels" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_user_channel" UNIQUE ("user_id", "channel_id"),
				CONSTRAINT "FK_user_channels_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				CONSTRAINT "FK_user_channels_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE,
				CONSTRAINT "FK_user_channels_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
			);
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_channels_channel"`);
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_user_channels_user_tenant"`,
		);
		await queryRunner.query(`DROP TABLE IF EXISTS "user_channels"`);
		await queryRunner.query(
			`ALTER TABLE "channels" DROP COLUMN IF EXISTS "is_active"`,
		);
	}
}
