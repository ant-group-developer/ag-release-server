import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelHistories1781086000000 implements MigrationInterface {
	name = 'AddChannelHistories1781086000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "channel_histories" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"user_id" uuid NOT NULL,
				"channel_id" uuid NOT NULL,
				"channel" jsonb NOT NULL,
				CONSTRAINT "PK_channel_histories_id" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_channel_histories_channel_id" ON "channel_histories" ("channel_id")`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "channel_histories" IS 'Lich su thay doi cac truong quan trong cua channel'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX "public"."IDX_channel_histories_channel_id"`,
		);
		await queryRunner.query(`DROP TABLE "channel_histories"`);
	}
}
