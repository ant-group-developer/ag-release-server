import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelVevoStatus1780455239103 implements MigrationInterface {
	name = 'AddChannelVevoStatus1780455239103';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "public"."channels_status_enum" AS ENUM('requested', 'processing', 'success', 'failed')`,
		);
		await queryRunner.query(
			`ALTER TABLE "channels" ADD "status" "public"."channels_status_enum" NOT NULL DEFAULT 'processing'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."status" IS 'Vevo channel creation status'`,
		);
		await queryRunner.query(`ALTER TABLE "channels" ADD "error" text`);
		await queryRunner.query(
			`COMMENT ON COLUMN "channels"."error" IS 'Vevo channel creation error'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "channels" DROP COLUMN "error"`);
		await queryRunner.query(`ALTER TABLE "channels" DROP COLUMN "status"`);
		await queryRunner.query(`DROP TYPE "public"."channels_status_enum"`);
	}
}
