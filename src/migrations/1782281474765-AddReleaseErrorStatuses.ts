import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReleaseErrorStatuses1782281474765
	implements MigrationInterface
{
	name = 'AddReleaseErrorStatuses1782281474765';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "public"."release_errors_submission_status_enum" AS ENUM('OPEN', 'FIXED')`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."release_errors_approval_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" DROP COLUMN "is_fixed"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD "submission_status" "public"."release_errors_submission_status_enum" NOT NULL DEFAULT 'OPEN'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD "approval_status" "public"."release_errors_approval_status_enum" NOT NULL DEFAULT 'PENDING'`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_submission_status" ON "release_errors" ("submission_status")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_errors_approval_status" ON "release_errors" ("approval_status")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_release_errors_approval_status"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_release_errors_submission_status"`);
		await queryRunner.query(`ALTER TABLE "release_errors" DROP COLUMN "approval_status"`);
		await queryRunner.query(`ALTER TABLE "release_errors" DROP COLUMN "submission_status"`);
		await queryRunner.query(
			`ALTER TABLE "release_errors" ADD "is_fixed" boolean NOT NULL DEFAULT false`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."release_errors_approval_status_enum"`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."release_errors_submission_status_enum"`,
		);
	}
}
