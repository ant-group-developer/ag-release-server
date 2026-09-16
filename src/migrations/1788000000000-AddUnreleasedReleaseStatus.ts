import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnreleasedReleaseStatus1788000000000
	implements MigrationInterface
{
	name = 'AddUnreleasedReleaseStatus1788000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TYPE "public"."releases_status_enum"
			ADD VALUE IF NOT EXISTS 'unreleased'
		`);

		await queryRunner.query(`
			ALTER TYPE "public"."release_dsp_delivery_status_enum"
			ADD VALUE IF NOT EXISTS 'unreleased'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "release_dsp_delivery"
			SET "status" = 'processing'
			WHERE "status" = 'unreleased'
		`);

		await queryRunner.query(`
			ALTER TYPE "public"."release_dsp_delivery_status_enum"
			RENAME TO "release_dsp_delivery_status_enum_old"
		`);

		await queryRunner.query(`
			CREATE TYPE "public"."release_dsp_delivery_status_enum" AS ENUM(
				'draft',
				'never_distributed',
				'processing',
				'issues',
				'distributed',
				'taken_down'
			)
		`);

		await queryRunner.query(`
			ALTER TABLE "release_dsp_delivery"
			ALTER COLUMN "status" DROP DEFAULT
		`);

		await queryRunner.query(`
			ALTER TABLE "release_dsp_delivery"
			ALTER COLUMN "status" TYPE "public"."release_dsp_delivery_status_enum"
			USING "status"::text::"public"."release_dsp_delivery_status_enum"
		`);

		await queryRunner.query(`
			ALTER TABLE "release_dsp_delivery"
			ALTER COLUMN "status" SET DEFAULT 'never_distributed'
		`);

		await queryRunner.query(`
			DROP TYPE "public"."release_dsp_delivery_status_enum_old"
		`);

		await queryRunner.query(`
			UPDATE "releases"
			SET "status" = 'processing'
			WHERE "status" = 'unreleased'
		`);

		await queryRunner.query(`
			ALTER TYPE "public"."releases_status_enum"
			RENAME TO "releases_status_enum_old"
		`);

		await queryRunner.query(`
			CREATE TYPE "public"."releases_status_enum" AS ENUM(
				'draft',
				'submitted',
				'processing',
				'awaiting_action',
				'distributed',
				'partial_done',
				'failed',
				'taken_down'
			)
		`);

		await queryRunner.query(`
			ALTER TABLE "releases"
			ALTER COLUMN "status" DROP DEFAULT
		`);

		await queryRunner.query(`
			ALTER TABLE "releases"
			ALTER COLUMN "status" TYPE "public"."releases_status_enum"
			USING "status"::text::"public"."releases_status_enum"
		`);

		await queryRunner.query(`
			ALTER TABLE "releases"
			ALTER COLUMN "status" SET DEFAULT 'draft'
		`);

		await queryRunner.query(`
			DROP TYPE "public"."releases_status_enum_old"
		`);
	}
}
