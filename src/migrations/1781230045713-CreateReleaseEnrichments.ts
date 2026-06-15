import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleaseEnrichments1781230045713
	implements MigrationInterface
{
	name = 'CreateReleaseEnrichments1781230045713';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "release_enrichments" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"release_id" uuid NOT NULL,
				"status" character varying(20) NOT NULL DEFAULT 'PENDING',
				"last_scanned_at" TIMESTAMP WITH TIME ZONE,
				"error_message" text,
				"last_scan_id" character varying(50),
				"enrichment_source" character varying(20),
				CONSTRAINT "PK_release_enrichments_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_release_enrichments_release_id" UNIQUE ("release_id"),
				CONSTRAINT "FK_release_enrichments_release_id_releases" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(
			`COMMENT ON TABLE "release_enrichments" IS 'Bảng theo dõi trạng thái enrich metadata của từng release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."release_id" IS 'ID release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."status" IS 'Trạng thái enrich: PENDING, SUCCESS, FAILED, NOT_FOUND'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."last_scanned_at" IS 'Thời điểm quét cuối cùng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."error_message" IS 'Lỗi chi tiết nếu status = FAILED'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."last_scan_id" IS 'ID của đợt quét cuối cùng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_enrichments"."enrichment_source" IS 'Nguồn enrich: spotify, deezer, etc.'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "release_enrichments"`);
	}
}
