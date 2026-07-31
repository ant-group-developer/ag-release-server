import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * distribution.package_uri (text, 1 package chung) → package_uris (jsonb, map dspRoute→path).
 *
 * 1 release phát tới nhiều đích khác ernVersion/sender/SFTP (Spotify direct ERN 4.3 vs CI
 * aggregator ERN 3.8.2) → build 1 package/nhóm thay vì 1 package chung.
 *
 * Backfill: bản ghi cũ có package_uri không null → gói thành {"_legacy": <uri>} để không mất
 * dữ liệu; null → {}. (_legacy không khớp groupKey nào nên không channel nào đọc trúng — chấp
 * nhận: distribution đang dở sẽ build lại đúng nhóm ở lần retry; v-next chưa có prod data.)
 */
export class DistributionPackageUrisJsonb1785100000000
	implements MigrationInterface
{
	name = 'DistributionPackageUrisJsonb1785100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "distribution"
				ADD COLUMN "package_uris" jsonb NOT NULL DEFAULT '{}'::jsonb
		`);
		await queryRunner.query(`
			UPDATE "distribution"
				SET "package_uris" = jsonb_build_object('_legacy', "package_uri")
				WHERE "package_uri" IS NOT NULL
		`);
		await queryRunner.query(`
			ALTER TABLE "distribution" DROP COLUMN "package_uri"
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "distribution" ADD COLUMN "package_uri" text
		`);
		await queryRunner.query(`
			UPDATE "distribution"
				SET "package_uri" = "package_uris"->>'_legacy'
				WHERE "package_uris" ? '_legacy'
		`);
		await queryRunner.query(`
			ALTER TABLE "distribution" DROP COLUMN "package_uris"
		`);
	}
}
