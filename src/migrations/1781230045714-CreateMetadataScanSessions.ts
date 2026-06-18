import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetadataScanSessions1781230045714
	implements MigrationInterface
{
	name = 'CreateMetadataScanSessions1781230045714';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "metadata_scan_sessions" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"status" character varying(20) NOT NULL DEFAULT 'PENDING',
				"total_releases" integer NOT NULL DEFAULT 0,
				"processed_releases" integer NOT NULL DEFAULT 0,
				"success_count" integer NOT NULL DEFAULT 0,
				"failed_count" integer NOT NULL DEFAULT 0,
				"not_found_count" integer NOT NULL DEFAULT 0,
				"dry_run" boolean NOT NULL DEFAULT false,
				"force" boolean NOT NULL DEFAULT false,
				"limit_count" integer,
				"error_message" text,
				"started_at" TIMESTAMP WITH TIME ZONE,
				"finished_at" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_metadata_scan_sessions_id" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(
			`COMMENT ON TABLE "metadata_scan_sessions" IS 'Bảng lưu lịch sử các lượt quét (scan) enrich metadata'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "metadata_scan_sessions"`);
	}
}
