import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoTriggersToSyncOutbox1781365000000 implements MigrationInterface {
	name = 'AddVideoTriggersToSyncOutbox1781365000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Update trigger function to support video_artist -> videos mapping
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
				ELSIF TG_TABLE_NAME = 'video_artist' THEN
					v_entity_name := 'videos';
					v_entity_id := COALESCE(NEW.video_id, OLD.video_id)::VARCHAR;
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

		// Add triggers on videos and video_artist
		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_videos_to_clickhouse
			AFTER INSERT OR UPDATE OR DELETE ON "videos"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
		`);

		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_video_artists_to_clickhouse
			AFTER INSERT OR UPDATE OR DELETE ON "video_artist"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_videos_to_clickhouse ON "videos"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_video_artists_to_clickhouse ON "video_artist"`);

		// Revert to old queue_and_notify_sync
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
	}
}
