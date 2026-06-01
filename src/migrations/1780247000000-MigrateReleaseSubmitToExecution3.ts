import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateReleaseSubmitToExecution31780247000000
	implements MigrationInterface
{
	name = 'MigrateReleaseSubmitToExecution31780247000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			INSERT INTO "release_excutions3" (
				"id",
				"created_at",
				"updated_at",
				"type",
				"release_title",
				"release_upc",
				"release_id",
				"status",
				"completed_at",
				"summary",
				"metadata"
			)
			SELECT
				rs."id",
				rs."created_at",
				rs."updated_at",
				rs."type",
				rs."release_title",
				rs."release_upc",
				rs."release_id",
				rs."status"::varchar,
				rs."completed_at",
				rs."summary",
				rs."metadata"
			FROM "release_submits" rs
			WHERE NOT EXISTS (
				SELECT 1
				FROM "release_excutions3" re3
				WHERE re3."id" = rs."id"
			)
		`);

		await queryRunner.query(`
			INSERT INTO "release_execution_steps3" (
				"id",
				"created_at",
				"updated_at",
				"release_execution_id",
				"parent_step_id",
				"type",
				"status",
				"order",
				"metadata",
				"started_at",
				"completed_at",
				"child_execution_mode"
			)
			SELECT
				rss."id",
				rss."created_at",
				rss."updated_at",
				rss."release_submit_id",
				rss."parent_step_id",
				CASE rss."type"
					WHEN 'CREATE_AND_UPLOAD_DIRECT' THEN 'UPLOAD_METADATA_TO_SFTP'
					WHEN 'CREATE_AND_UPLOAD_CI' THEN 'UPLOAD_METADATA_TO_SFTP'
					WHEN 'SYNC_DATA_FROM_DSP' THEN 'SYNC_DATA_PARTNER'
					WHEN 'SEND_EMAIL_TO_STATE' THEN 'SEND_EMAIL_STATE51'
					ELSE rss."type"
				END,
				rss."status"::varchar,
				rss."order",
				CASE
					WHEN rss."scheduled_at" IS NULL THEN rss."metadata"
					ELSE COALESCE(rss."metadata", '{}'::jsonb) || jsonb_build_object('scheduledAt', rss."scheduled_at")
				END,
				rss."started_at",
				rss."completed_at",
				'sequential'
			FROM "release_submit_steps" rss
			WHERE EXISTS (
				SELECT 1
				FROM "release_excutions3" re3
				WHERE re3."id" = rss."release_submit_id"
			)
			AND (
				rss."parent_step_id" IS NULL
				OR EXISTS (
					SELECT 1
					FROM "release_submit_steps" parent_step
					WHERE parent_step."id" = rss."parent_step_id"
				)
			)
			AND NOT EXISTS (
				SELECT 1
				FROM "release_execution_steps3" res3
				WHERE res3."id" = rss."id"
			)
		`);

		await queryRunner.query(`
			INSERT INTO "ci_distribution_jobs3" (
				"id",
				"created_at",
				"updated_at",
				"type",
				"upc",
				"note",
				"dsp_ci_codes",
				"release_execution_id",
				"step_id",
				"release_id",
				"status",
				"delivery_email",
				"delivery_email_subject",
				"sent_at",
				"ci_tool_next_check_at",
				"ci_tool_job_id",
				"step_label"
			)
			SELECT
				cj."id",
				cj."created_at",
				cj."updated_at",
				CASE cj."type"
					WHEN 'email_state51' THEN 'EMAIL_STATE51'
					WHEN 'admin_export' THEN 'ADMIN_EXPORT'
					ELSE upper(cj."type")
				END,
				cj."upc",
				cj."note",
				cj."dsp_ci_codes",
				cj."release_submit_id",
				cj."step_id",
				cj."release_id",
				CASE cj."status"
					WHEN 'pending' THEN 'PENDING'
					WHEN 'processing' THEN 'PROCESSING'
					WHEN 'completed' THEN 'COMPLETED'
					WHEN 'failed' THEN 'FAILED'
					WHEN 'skipped' THEN 'CANCEL'
					ELSE upper(cj."status")
				END,
				cj."delivery_email",
				cj."delivery_email_subject",
				cj."sent_at",
				cj."ci_tool_next_check_at",
				cj."ci_tool_job_id",
				cj."step_label"
			FROM "ci_distribution_jobs" cj
			WHERE EXISTS (
				SELECT 1
				FROM "release_excutions3" re3
				WHERE re3."id" = cj."release_submit_id"
			)
			AND EXISTS (
				SELECT 1
				FROM "release_execution_steps3" res3
				WHERE res3."id" = cj."step_id"
			)
			AND NOT EXISTS (
				SELECT 1
				FROM "ci_distribution_jobs3" cj3
				WHERE cj3."id" = cj."id"
			)
		`);

		await queryRunner.query(`
			UPDATE "logs" log
			SET "release_execution_id" = log."release_submit_id"
			WHERE log."release_submit_id" IS NOT NULL
			AND log."release_execution_id" IS NULL
			AND EXISTS (
				SELECT 1
				FROM "release_excutions3" re3
				WHERE re3."id" = log."release_submit_id"
			)
		`);

		await queryRunner.query(`
			UPDATE "logs" log
			SET "release_execution_step_id" = log."release_submit_step_id"
			WHERE log."release_submit_step_id" IS NOT NULL
			AND log."release_execution_step_id" IS NULL
			AND EXISTS (
				SELECT 1
				FROM "release_execution_steps3" res3
				WHERE res3."id" = log."release_submit_step_id"
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "logs" log
			SET "release_execution_step_id" = NULL
			WHERE log."release_submit_step_id" IS NOT NULL
			AND log."release_execution_step_id" = log."release_submit_step_id"
		`);

		await queryRunner.query(`
			UPDATE "logs" log
			SET "release_execution_id" = NULL
			WHERE log."release_submit_id" IS NOT NULL
			AND log."release_execution_id" = log."release_submit_id"
		`);

		await queryRunner.query(`
			DELETE FROM "ci_distribution_jobs3" cj3
			WHERE EXISTS (
				SELECT 1
				FROM "ci_distribution_jobs" cj
				WHERE cj."id" = cj3."id"
			)
		`);

		await queryRunner.query(`
			DELETE FROM "release_execution_steps3" res3
			WHERE EXISTS (
				SELECT 1
				FROM "release_submit_steps" rss
				WHERE rss."id" = res3."id"
			)
		`);

		await queryRunner.query(`
			DELETE FROM "release_excutions3" re3
			WHERE EXISTS (
				SELECT 1
				FROM "release_submits" rs
				WHERE rs."id" = re3."id"
			)
		`);
	}
}
