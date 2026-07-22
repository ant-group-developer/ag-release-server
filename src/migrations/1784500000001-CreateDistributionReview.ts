import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 Khối B — bảng `distribution_review`.
 *
 * Audit quyết định duyệt (ai/khi nào/note). KHÁC `orchestration_ticket`:
 *   · review row  = lịch sử quyết định reviewer (pending → approved | rejected)
 *   · ticket      = điểm hỏng để user sửa (REVIEW_REJECT → ACTION_REQUIRED)
 */
export class CreateDistributionReview1784500000001
	implements MigrationInterface
{
	name = 'CreateDistributionReview1784500000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "distribution_review" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"reviewer_id" uuid,
				"status" varchar(20) NOT NULL DEFAULT 'pending',
				"note" text,
				"decided_at" TIMESTAMP WITH TIME ZONE,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_review" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_dist_review_distribution_id" ON "distribution_review" ("distribution_id")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_dist_review_distribution_id"`,
		);
		await queryRunner.query(
			`DROP TABLE IF EXISTS "distribution_review"`,
		);
	}
}
