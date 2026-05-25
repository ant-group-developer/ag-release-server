import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClickHouseSyncOutbox1779420000000 implements MigrationInterface {
    name = 'AddClickHouseSyncOutbox1779420000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Tao bang outbox
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "clickhouse_sync_outbox" (
                "id" BIGSERIAL PRIMARY KEY,
                "entity_name" VARCHAR(50) NOT NULL,
                "entity_id" VARCHAR(50) NOT NULL,
                "action" VARCHAR(20) NOT NULL,
                "processed" BOOLEAN DEFAULT FALSE,
                "error_message" TEXT,
                "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "processed_at" TIMESTAMP
            )
        `);

        // 2. Partial Unique Index - tu dong nen du lieu (Deduplicate)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "uq_outbox_unprocessed_entity"
            ON "clickhouse_sync_outbox" ("entity_name", "entity_id")
            WHERE ("processed" = FALSE)
        `);

        // 3. Index cho viec quet ban ghi chua xu ly
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_outbox_pending"
            ON "clickhouse_sync_outbox" ("processed", "created_at")
            WHERE ("processed" = FALSE)
        `);

        // 4. Index cho viec don dep (pruning) lich su cu
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_outbox_prunable"
            ON "clickhouse_sync_outbox" ("processed", "processed_at")
            WHERE ("processed" = TRUE)
        `);

        // 5. Tao Function Trigger
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION queue_and_notify_sync()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
                VALUES (
                    TG_TABLE_NAME,
                    COALESCE(NEW.id, OLD.id)::VARCHAR,
                    TG_OP,
                    FALSE
                )
                ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
                DO UPDATE SET
                    "created_at" = CURRENT_TIMESTAMP,
                    "action" = EXCLUDED."action",
                    "error_message" = NULL;

                PERFORM pg_notify('clickhouse_sync_channel', TG_TABLE_NAME);
                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql
        `);

        // 6. Gan Trigger vao bang tracks
        await queryRunner.query(`
            CREATE OR REPLACE TRIGGER sync_tracks_to_clickhouse
            AFTER INSERT OR UPDATE OR DELETE ON "tracks"
            FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
        `);

        // 7. Gan Trigger vao bang releases
        await queryRunner.query(`
            CREATE OR REPLACE TRIGGER sync_releases_to_clickhouse
            AFTER INSERT OR UPDATE OR DELETE ON "releases"
            FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS sync_tracks_to_clickhouse ON "tracks"`);
        await queryRunner.query(`DROP TRIGGER IF EXISTS sync_releases_to_clickhouse ON "releases"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS queue_and_notify_sync`);
        await queryRunner.query(`DROP TABLE IF EXISTS "clickhouse_sync_outbox"`);
    }
}
