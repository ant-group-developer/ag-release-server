import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArtistTriggerToSyncOutbox1780388956871ABC implements MigrationInterface {
    name = 'AddArtistTriggerToSyncOutbox1780388956871ABC'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Cap nhat trigger function de ho tro dich tu track_artist -> tracks
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION queue_and_notify_sync()
            RETURNS TRIGGER AS $$
            DECLARE
                v_entity_name VARCHAR;
                v_entity_id VARCHAR;
            BEGIN
                IF TG_TABLE_NAME = 'track_artist' THEN
                    v_entity_name := 'tracks';
                    v_entity_id := COALESCE(NEW.track_id, OLD.track_id)::VARCHAR;
                ELSE
                    v_entity_name := TG_TABLE_NAME;
                    v_entity_id := COALESCE(NEW.id, OLD.id)::VARCHAR;
                END IF;

                INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
                VALUES (
                    v_entity_name,
                    v_entity_id,
                    TG_OP,
                    FALSE
                )
                ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
                DO UPDATE SET
                    "created_at" = CURRENT_TIMESTAMP,
                    "action" = EXCLUDED."action",
                    "error_message" = NULL;

                PERFORM pg_notify('clickhouse_sync_channel', v_entity_name);
                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql
        `);

        // 2. Gan trigger vao bang track_artist (Tạo mới để đồng bộ khi thay đổi liên kết nghệ sĩ)
        await queryRunner.query(`
            CREATE OR REPLACE TRIGGER sync_track_artists_to_clickhouse
            AFTER INSERT OR UPDATE OR DELETE ON "track_artist"
            FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Drop trigger tren track_artist
        await queryRunner.query(`DROP TRIGGER IF EXISTS sync_track_artists_to_clickhouse ON "track_artist"`);

        // 2. Khoi phuc trigger function cu chi ho tro tracks/releases
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
    }
}
