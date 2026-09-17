import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Distribution-v2 foundation.
 *
 * All objects live in a dedicated schema and deliberately avoid foreign keys
 * to the legacy release/execution tables. The v2 module owns these tables and
 * uses release_id/dsp_id as reference values across bounded contexts.
 */
export class CreateDistributionV2Foundation1789000000000
	implements MigrationInterface
{
	name = 'CreateDistributionV2Foundation1789000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
		await queryRunner.query(
			`CREATE SCHEMA IF NOT EXISTS "distribution_v2"`,
		);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."release_snapshots" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"release_id" uuid NOT NULL,
				"source_updated_at" TIMESTAMP WITH TIME ZONE,
				"payload" jsonb NOT NULL,
				"asset_manifest" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"selected_dsp_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
				"content_hash" character varying(128) NOT NULL,
				"track_order_hash" character varying(128) NOT NULL,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_release_snapshots"
					PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_snapshot_release_id"
			ON "distribution_v2"."release_snapshots" ("release_id")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."distributions" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"release_id" uuid NOT NULL,
				"tenant_id" uuid NOT NULL,
				"type" character varying(30) NOT NULL,
				"status" character varying(40) NOT NULL,
				"snapshot_id" uuid NOT NULL,
				"correlation_id" uuid NOT NULL,
				"created_by" uuid,
				"version" integer NOT NULL DEFAULT 0,
				"resubmitted_from_id" uuid,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_distributions"
					PRIMARY KEY ("id"),
				CONSTRAINT "FK_distribution_v2_snapshot"
					FOREIGN KEY ("snapshot_id")
					REFERENCES "distribution_v2"."release_snapshots"("id")
					ON DELETE RESTRICT,
				CONSTRAINT "FK_distribution_v2_resubmitted_from"
					FOREIGN KEY ("resubmitted_from_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE SET NULL
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_release_id"
			ON "distribution_v2"."distributions" ("release_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_status"
			ON "distribution_v2"."distributions" ("status")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_correlation_id"
			ON "distribution_v2"."distributions" ("correlation_id")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."channel_deliveries" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"dsp_id" character varying(10),
				"dsp_code" character varying(50) NOT NULL,
				"route" character varying(20) NOT NULL,
				"aggregator_code" character varying(30),
				"status" character varying(40) NOT NULL,
				"current_stage" character varying(60),
				"retry_count" integer NOT NULL DEFAULT 0,
				"previous_live" boolean NOT NULL DEFAULT false,
				"wait_reason" character varying(30),
				"scheduled_at" TIMESTAMP WITH TIME ZONE,
				"last_error" jsonb,
				"external_refs" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_channel_deliveries"
					PRIMARY KEY ("id"),
				CONSTRAINT "FK_distribution_v2_channel_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_channel_distribution_id"
			ON "distribution_v2"."channel_deliveries" ("distribution_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_channel_waiting"
			ON "distribution_v2"."channel_deliveries" ("status", "scheduled_at")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."step_runs" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"channel_id" uuid,
				"step_type" character varying(60) NOT NULL,
				"status" character varying(30) NOT NULL,
				"attempt_no" integer NOT NULL DEFAULT 1,
				"idempotency_key" character varying(180) NOT NULL,
				"input" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"output" jsonb,
				"error" jsonb,
				"started_at" TIMESTAMP WITH TIME ZONE,
				"completed_at" TIMESTAMP WITH TIME ZONE,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_step_runs"
					PRIMARY KEY ("id"),
				CONSTRAINT "FK_distribution_v2_step_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_step_channel"
					FOREIGN KEY ("channel_id")
					REFERENCES "distribution_v2"."channel_deliveries"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_step_distribution_id"
			ON "distribution_v2"."step_runs" ("distribution_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_step_channel_id"
			ON "distribution_v2"."step_runs" ("channel_id")
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_distribution_v2_step_idempotency"
			ON "distribution_v2"."step_runs" ("idempotency_key")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."distribution_events" (
				"id" BIGSERIAL NOT NULL,
				"distribution_id" uuid NOT NULL,
				"channel_id" uuid,
				"step_id" uuid,
				"event_type" character varying(80) NOT NULL,
				"level" character varying(20) NOT NULL DEFAULT 'milestone',
				"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"correlation_id" uuid NOT NULL,
				"occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_events"
					PRIMARY KEY ("id"),
				CONSTRAINT "FK_distribution_v2_event_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_event_channel"
					FOREIGN KEY ("channel_id")
					REFERENCES "distribution_v2"."channel_deliveries"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_event_step"
					FOREIGN KEY ("step_id")
					REFERENCES "distribution_v2"."step_runs"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_event_distribution_id_id"
			ON "distribution_v2"."distribution_events" ("distribution_id", "id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_event_type"
			ON "distribution_v2"."distribution_events" ("event_type")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."outbox_events" (
				"id" BIGSERIAL NOT NULL,
				"distribution_id" uuid NOT NULL,
				"queue_name" character varying(100) NOT NULL,
				"payload" jsonb NOT NULL,
				"job_id" character varying(180) NOT NULL,
				"available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"lease_until" TIMESTAMP WITH TIME ZONE,
				"attempts" integer NOT NULL DEFAULT 0,
				"last_error" text,
				"last_attempted_at" TIMESTAMP WITH TIME ZONE,
				"dispatched_at" TIMESTAMP WITH TIME ZONE,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_outbox"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_outbox_job_id"
					UNIQUE ("job_id"),
				CONSTRAINT "FK_distribution_v2_outbox_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_outbox_pending"
			ON "distribution_v2"."outbox_events" ("dispatched_at", "available_at")
			WHERE "dispatched_at" IS NULL
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."external_operations" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"provider" character varying(40) NOT NULL,
				"operation_type" character varying(60) NOT NULL,
				"idempotency_key" character varying(180) NOT NULL,
				"request_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
				"response_payload" jsonb,
				"external_id" character varying(180),
				"status" character varying(20) NOT NULL,
				"attempts" integer NOT NULL DEFAULT 0,
				"last_error" text,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_external_operations"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_external_operation_key"
					UNIQUE ("idempotency_key")
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_external_provider_type"
			ON "distribution_v2"."external_operations" ("provider", "operation_type")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."export_batches" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"tenant_id" uuid NOT NULL,
				"aggregator_code" character varying(30) NOT NULL,
				"type" character varying(30) NOT NULL,
				"business_date" date NOT NULL,
				"cutoff_at" TIMESTAMP WITH TIME ZONE NOT NULL,
				"status" character varying(30) NOT NULL,
				"artifact_path" text,
				"external_job_id" character varying(180),
				"sent_at" TIMESTAMP WITH TIME ZONE,
				"last_error" text,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_export_batches"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_export_batch_key"
					UNIQUE ("tenant_id", "aggregator_code", "type", "business_date")
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_export_batch_lookup"
			ON "distribution_v2"."export_batches"
			("tenant_id", "aggregator_code", "type", "business_date")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."export_batch_members" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"batch_id" uuid NOT NULL,
				"distribution_id" uuid NOT NULL,
				"channel_id" uuid NOT NULL,
				"release_id" uuid NOT NULL,
				"upc" character varying(20),
				"dsp_code" character varying(50) NOT NULL,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_export_batch_members"
					PRIMARY KEY ("id"),
				CONSTRAINT "UQ_distribution_v2_export_batch_member"
					UNIQUE ("batch_id", "channel_id"),
				CONSTRAINT "FK_distribution_v2_batch_member_batch"
					FOREIGN KEY ("batch_id")
					REFERENCES "distribution_v2"."export_batches"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_batch_member_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_batch_member_channel"
					FOREIGN KEY ("channel_id")
					REFERENCES "distribution_v2"."channel_deliveries"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_batch_member_distribution_id"
			ON "distribution_v2"."export_batch_members" ("distribution_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_batch_member_release_id"
			ON "distribution_v2"."export_batch_members" ("release_id")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."issues" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"distribution_id" uuid NOT NULL,
				"channel_id" uuid,
				"step_id" uuid,
				"code" character varying(60) NOT NULL,
				"severity" character varying(20) NOT NULL,
				"message" text NOT NULL,
				"raw_payload" jsonb,
				"status" character varying(20) NOT NULL DEFAULT 'OPEN',
				"resolved_at" TIMESTAMP WITH TIME ZONE,
				"resolved_by" uuid,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_issues"
					PRIMARY KEY ("id"),
				CONSTRAINT "FK_distribution_v2_issue_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_issue_channel"
					FOREIGN KEY ("channel_id")
					REFERENCES "distribution_v2"."channel_deliveries"("id")
					ON DELETE CASCADE,
				CONSTRAINT "FK_distribution_v2_issue_step"
					FOREIGN KEY ("step_id")
					REFERENCES "distribution_v2"."step_runs"("id")
					ON DELETE CASCADE
			)
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_issue_distribution_id"
			ON "distribution_v2"."issues" ("distribution_id")
		`);
		await queryRunner.query(`
			CREATE INDEX "IDX_distribution_v2_issue_status"
			ON "distribution_v2"."issues" ("status")
		`);

		await queryRunner.query(`
			CREATE TABLE "distribution_v2"."distribution_summary" (
				"distribution_id" uuid NOT NULL,
				"release_id" uuid NOT NULL,
				"status" character varying(40) NOT NULL,
				"total_channels" integer NOT NULL DEFAULT 0,
				"live_channels" integer NOT NULL DEFAULT 0,
				"waiting_channels" integer NOT NULL DEFAULT 0,
				"issue_channels" integer NOT NULL DEFAULT 0,
				"current_step" character varying(60),
				"latest_error" jsonb,
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_distribution_v2_summary"
					PRIMARY KEY ("distribution_id"),
				CONSTRAINT "FK_distribution_v2_summary_distribution"
					FOREIGN KEY ("distribution_id")
					REFERENCES "distribution_v2"."distributions"("id")
					ON DELETE CASCADE
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP SCHEMA IF EXISTS "distribution_v2" CASCADE`,
		);
	}
}
