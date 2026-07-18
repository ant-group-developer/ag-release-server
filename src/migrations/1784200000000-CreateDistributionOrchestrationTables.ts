import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 Step 2 — 4 bảng cho module distribution-orchestration.
 *
 * distribution        : aggregate root, milestone state machine
 * channel_delivery    : entity con per-channel, chạy DeliveryProcess
 * distribution_event  : event store (timeline + audit), jsonb payload + 3 cột chiếu
 * outbox_event        : "ý định enqueue" BullMQ, relay đọc bảng này
 *
 * KHÔNG FK tới releases (bounded context khác — Release Authoring).
 * FK chỉ trong cùng context: distribution → 3 bảng con (CASCADE).
 * Partial index cho outbox_event chỉ trên rows chưa dispatch (relay poll nhẹ).
 */
export class CreateDistributionOrchestrationTables1784200000000
      implements MigrationInterface
{
      name = 'CreateDistributionOrchestrationTables1784200000000';

      public async up(queryRunner: QueryRunner): Promise<void> {
              // ─── 1. distribution ───
              await queryRunner.query(`
                      CREATE TABLE "distribution" (
                              "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                              "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              "release_id" uuid NOT NULL,
                              "snapshot_id" uuid NOT NULL,
                              "tenant_id" uuid NOT NULL,
                              "type" character varying(30) NOT NULL,
                              "correlation_id" uuid NOT NULL,
                              "state" character varying(30) NOT NULL DEFAULT 'DRAFT',
                              "upc" character varying(14),
                              "package_uri" text,
                              "retry_count" integer NOT NULL DEFAULT 0,
                              "version" integer NOT NULL DEFAULT 0,
                              CONSTRAINT "PK_distribution" PRIMARY KEY ("id")
                      )
              `);
              await queryRunner.query(
                      `CREATE INDEX "IDX_distribution_release_id" ON "distribution" ("release_id")`,
              );
              await queryRunner.query(
                      `CREATE INDEX "IDX_distribution_state" ON "distribution" ("state")`,
              );
              await queryRunner.query(
                      `CREATE INDEX "IDX_distribution_correlation_id" ON "distribution" ("correlation_id")`,
              );

              // ─── 2. channel_delivery ───
              await queryRunner.query(`
                      CREATE TABLE "channel_delivery" (
                              "channel_id" character varying(80) NOT NULL,
                              "distribution_id" uuid NOT NULL,
                              "spawn_order" integer NOT NULL,
                              "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              "dsp_code" character varying(30) NOT NULL,
                              "topology" character varying(20) NOT NULL,
                              "process_code" character varying(60) NOT NULL,
                              "aggregator_code" character varying(30),
                              "export_method" character varying(20),
                              "has_deal" boolean,
                              "pos" integer NOT NULL DEFAULT 0,
                              "state" character varying(20) NOT NULL DEFAULT 'PENDING',
                              "retry_count" integer NOT NULL DEFAULT 0,
                              "ticket_ref" character varying(80),
                              "scheduled_at" TIMESTAMP WITH TIME ZONE,
                              CONSTRAINT "PK_channel_delivery" PRIMARY KEY ("channel_id"),
                              CONSTRAINT "FK_channel_delivery_distribution"
                                      FOREIGN KEY ("distribution_id") REFERENCES "distribution"("id")
                                      ON DELETE CASCADE ON UPDATE NO ACTION
                      )
              `);
              await queryRunner.query(
                      `CREATE INDEX "IDX_channel_delivery_distribution_id" ON "channel_delivery" ("distribution_id")`,
              );
              await queryRunner.query(
                      `CREATE INDEX "IDX_channel_delivery_state_scheduled_at" ON "channel_delivery" ("state", "scheduled_at")`,
              );

              // ─── 3. distribution_event ───
              await queryRunner.query(`
                      CREATE TABLE "distribution_event" (
                              "id" BIGSERIAL NOT NULL,
                              "distribution_id" uuid NOT NULL,
                              "channel_id" character varying(80),
                              "type" character varying(60) NOT NULL,
                              "level" character varying(20) NOT NULL DEFAULT 'milestone',
                              "payload" jsonb NOT NULL DEFAULT '{}',
                              "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                              "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              CONSTRAINT "PK_distribution_event" PRIMARY KEY ("id"),
                              CONSTRAINT "FK_distribution_event_distribution"
                                      FOREIGN KEY ("distribution_id") REFERENCES "distribution"("id")
                                      ON DELETE CASCADE ON UPDATE NO ACTION
                      )
              `);
              await queryRunner.query(
                      `CREATE INDEX "IDX_distribution_event_distribution_id_id" ON "distribution_event" ("distribution_id", "id")`,
              );
              await queryRunner.query(
                      `CREATE INDEX "IDX_distribution_event_type" ON "distribution_event" ("type")`,
              );

              // ─── 4. outbox_event ───
              await queryRunner.query(`
                      CREATE TABLE "outbox_event" (
                              "id" BIGSERIAL NOT NULL,
                              "distribution_id" uuid NOT NULL,
                              "queue" character varying(40) NOT NULL,
                              "payload" jsonb NOT NULL,
                              "job_id" character varying(120) NOT NULL,
                              "delay_ms" integer NOT NULL DEFAULT 0,
                              "run_at" TIMESTAMP WITH TIME ZONE,
                              "attempts" integer NOT NULL DEFAULT 0,
                              "last_error" text,
                              "last_attempted_at" TIMESTAMP WITH TIME ZONE,
                              "dispatched_at" TIMESTAMP WITH TIME ZONE,
                              "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                              CONSTRAINT "PK_outbox_event" PRIMARY KEY ("id"),
                              CONSTRAINT "UQ_outbox_event_job_id" UNIQUE ("job_id"),
                              CONSTRAINT "FK_outbox_event_distribution"
                                      FOREIGN KEY ("distribution_id") REFERENCES "distribution"("id")
                                      ON DELETE CASCADE ON UPDATE NO ACTION
                      )
              `);
              // PARTIAL INDEX: chỉ index rows chưa dispatch → relay poll cực nhẹ
              // (@Index decorator không hỗ trợ WHERE, phải raw SQL ở đây)
              await queryRunner.query(`
                      CREATE INDEX "IDX_outbox_event_pending"
                      ON "outbox_event" ("dispatched_at", "created_at")
                      WHERE "dispatched_at" IS NULL
              `);
      }

      public async down(queryRunner: QueryRunner): Promise<void> {
              // thứ tự ngược vì FK cascade
              await queryRunner.query(`DROP TABLE IF EXISTS "outbox_event"`);
              await queryRunner.query(`DROP TABLE IF EXISTS "distribution_event"`);
              await queryRunner.query(`DROP TABLE IF EXISTS "channel_delivery"`);
              await queryRunner.query(`DROP TABLE IF EXISTS "distribution"`);
      }
}