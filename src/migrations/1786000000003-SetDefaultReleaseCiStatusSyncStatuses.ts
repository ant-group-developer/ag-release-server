import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetDefaultReleaseCiStatusSyncStatuses1786000000003
	implements MigrationInterface
{
	name = 'SetDefaultReleaseCiStatusSyncStatuses1786000000003';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_status_sync_schedules"
			ALTER COLUMN "release_statuses"
			SET DEFAULT ARRAY['processing', 'failed']::varchar[]
		`);

		await queryRunner.query(`
			UPDATE "release_ci_status_sync_schedules"
			SET "release_statuses" = ARRAY['processing', 'failed']::varchar[]
			WHERE "release_statuses" = ARRAY['submitted', 'processing']::varchar[]
			OR "release_statuses" = ARRAY['issue', 'processing']::varchar[]
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_status_sync_schedules"
			ALTER COLUMN "release_statuses"
			SET DEFAULT ARRAY['submitted', 'processing']::varchar[]
		`);

		await queryRunner.query(`
			UPDATE "release_ci_status_sync_schedules"
			SET "release_statuses" = ARRAY['submitted', 'processing']::varchar[]
			WHERE "release_statuses" = ARRAY['processing', 'failed']::varchar[]
		`);
	}
}
