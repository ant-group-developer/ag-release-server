import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMilestonePartialIndex1784300000002
	implements MigrationInterface
{
	name = 'AddMilestonePartialIndex1784300000002';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Partial index cho timeline queries filtering level='milestone' (user view).
		// Covers ~60-70% of timeline API calls. Keyset cursor (distribution_id, id) tối ưu
		// nhưng khi thêm WHERE level='milestone', full index scan filtered rows.
		// Partial index chỉ chứa milestone rows → seek O(log N_milestone) thay vì O(log N_all).
		//
		// Dùng CREATE INDEX (không CONCURRENTLY) vì:
		// 1. CONCURRENTLY không chạy được trong transaction (TypeORM migration mặc định dùng transaction)
		// 2. Bảng distribution_event mới, ít data → lock thời gian ngắn, không ảnh hưởng
		await queryRunner.query(`
			CREATE INDEX IF NOT EXISTS "IDX_distribution_event_milestone"
			  ON "distribution_event" ("distribution_id", "id")
			  WHERE "level" = 'milestone'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "IDX_distribution_event_milestone"`,
		);
	}
}
