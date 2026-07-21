import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 Group C — bảng release_snapshot.
 *
 * Lưu immutable clone (jsonb) của Release entity tại thời điểm submit distribution.
 * DdexXmlPackageBuilder đọc snapshot để build DDEX package mà KHÔNG phụ thuộc
 * Release module (CQRS-lite, bounded-context decoupling).
 *
 * Cột channel_specs dự phòng cho trường hợp cần đính kèm channel metadata;
 * hiện tại chưa dùng (payload đã đủ).
 */
export class CreateReleaseSnapshot1784400000000
	implements MigrationInterface
{
	name = 'CreateReleaseSnapshot1784400000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "release_snapshot" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"release_id" uuid NOT NULL,
				"payload" jsonb NOT NULL,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_release_snapshot" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_release_snapshot_release_id" ON "release_snapshot" ("release_id")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_release_snapshot_release_id"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "release_snapshot"`,
		);
	}
}
