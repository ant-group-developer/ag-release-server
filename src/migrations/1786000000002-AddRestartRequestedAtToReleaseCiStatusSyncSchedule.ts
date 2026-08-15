import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestartRequestedAtToReleaseCiStatusSyncSchedule1786000000002
	implements MigrationInterface
{
	name = 'AddRestartRequestedAtToReleaseCiStatusSyncSchedule1786000000002';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_status_sync_schedules"
			ADD COLUMN IF NOT EXISTS "restart_requested_at" TIMESTAMP WITH TIME ZONE
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_ci_status_sync_schedules"
			DROP COLUMN IF EXISTS "restart_requested_at"
		`);
	}
}
