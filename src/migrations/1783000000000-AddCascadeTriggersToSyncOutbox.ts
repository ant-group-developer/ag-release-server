import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCascadeTriggersToSyncOutbox1783000000000 implements MigrationInterface {
	name = 'AddCascadeTriggersToSyncOutbox1783000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Cap nhat trigger function de ho tro cascade / indirect sync tu labels, artists, channels, release_cover_art
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION queue_and_notify_sync()
			RETURNS TRIGGER AS $$
			DECLARE
				v_entity_name VARCHAR;
				v_entity_id VARCHAR;
				r RECORD;
			BEGIN
				IF TG_TABLE_NAME = 'track_artist' THEN
					v_entity_name := 'tracks';
					v_entity_id := COALESCE(NEW.track_id, OLD.track_id)::VARCHAR;
					
					INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
					VALUES (v_entity_name, v_entity_id, TG_OP, FALSE)
					ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
					DO UPDATE SET
						"created_at" = CURRENT_TIMESTAMP,
						"action" = EXCLUDED."action",
						"error_message" = NULL;
					
					PERFORM pg_notify('clickhouse_sync_channel', v_entity_name);

				ELSIF TG_TABLE_NAME = 'video_artist' THEN
					v_entity_name := 'videos';
					v_entity_id := COALESCE(NEW.video_id, OLD.video_id)::VARCHAR;
					
					INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
					VALUES (v_entity_name, v_entity_id, TG_OP, FALSE)
					ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
					DO UPDATE SET
						"created_at" = CURRENT_TIMESTAMP,
						"action" = EXCLUDED."action",
						"error_message" = NULL;
					
					PERFORM pg_notify('clickhouse_sync_channel', v_entity_name);

				ELSIF TG_TABLE_NAME = 'release_cover_art' THEN
					v_entity_name := 'releases';
					v_entity_id := COALESCE(NEW.release_id, OLD.release_id)::VARCHAR;
					
					INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
					VALUES (v_entity_name, v_entity_id, TG_OP, FALSE)
					ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
					DO UPDATE SET
						"created_at" = CURRENT_TIMESTAMP,
						"action" = EXCLUDED."action",
						"error_message" = NULL;
					
					PERFORM pg_notify('clickhouse_sync_channel', v_entity_name);

				ELSIF TG_TABLE_NAME = 'labels' THEN
					-- Tim tat ca releases cua label nay de sync lai
					FOR r IN (SELECT id FROM "releases" WHERE "label_id" = COALESCE(NEW.id, OLD.id)) LOOP
						INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
						VALUES ('releases', r.id::VARCHAR, TG_OP, FALSE)
						ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
						DO UPDATE SET
							"created_at" = CURRENT_TIMESTAMP,
							"action" = EXCLUDED."action",
							"error_message" = NULL;
					END LOOP;
					PERFORM pg_notify('clickhouse_sync_channel', 'releases');

				ELSIF TG_TABLE_NAME = 'channels' THEN
					-- Tim tat ca videos cua channel nay de sync lai
					FOR r IN (SELECT id FROM "videos" WHERE "channel_id" = COALESCE(NEW.id, OLD.id)) LOOP
						INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
						VALUES ('videos', r.id::VARCHAR, TG_OP, FALSE)
						ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
						DO UPDATE SET
							"created_at" = CURRENT_TIMESTAMP,
							"action" = EXCLUDED."action",
							"error_message" = NULL;
					END LOOP;
					PERFORM pg_notify('clickhouse_sync_channel', 'videos');

				ELSIF TG_TABLE_NAME = 'artists' THEN
					-- Tim tat ca track_id de sync lai
					FOR r IN (SELECT DISTINCT track_id FROM "track_artist" WHERE "artist_id" = COALESCE(NEW.id, OLD.id)) LOOP
						INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
						VALUES ('tracks', r.track_id::VARCHAR, TG_OP, FALSE)
						ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
						DO UPDATE SET
							"created_at" = CURRENT_TIMESTAMP,
							"action" = EXCLUDED."action",
							"error_message" = NULL;
					END LOOP;
					PERFORM pg_notify('clickhouse_sync_channel', 'tracks');

					-- Tim tat ca video_id de sync lai
					FOR r IN (SELECT DISTINCT video_id FROM "video_artist" WHERE "artist_id" = COALESCE(NEW.id, OLD.id)) LOOP
						INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
						VALUES ('videos', r.video_id::VARCHAR, TG_OP, FALSE)
						ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
						DO UPDATE SET
							"created_at" = CURRENT_TIMESTAMP,
							"action" = EXCLUDED."action",
							"error_message" = NULL;
					END LOOP;
					PERFORM pg_notify('clickhouse_sync_channel', 'videos');

				ELSE
					v_entity_name := TG_TABLE_NAME;
					v_entity_id := COALESCE(NEW.id, OLD.id)::VARCHAR;
					
					INSERT INTO "clickhouse_sync_outbox" ("entity_name", "entity_id", "action", "processed")
					VALUES (v_entity_name, v_entity_id, TG_OP, FALSE)
					ON CONFLICT ("entity_name", "entity_id") WHERE ("processed" = FALSE)
					DO UPDATE SET
						"created_at" = CURRENT_TIMESTAMP,
						"action" = EXCLUDED."action",
						"error_message" = NULL;
					
					PERFORM pg_notify('clickhouse_sync_channel', v_entity_name);
				END IF;

				RETURN COALESCE(NEW, OLD);
			END;
			$$ LANGUAGE plpgsql;
		`);

		// 2. Dang ky triggers cho cac bang labels, artists, channels, release_cover_art
		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_labels_to_clickhouse
			AFTER UPDATE OR DELETE ON "labels"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync();
		`);

		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_artists_to_clickhouse
			AFTER UPDATE OR DELETE ON "artists"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync();
		`);

		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_channels_to_clickhouse
			AFTER UPDATE OR DELETE ON "channels"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync();
		`);

		await queryRunner.query(`
			CREATE OR REPLACE TRIGGER sync_release_cover_art_to_clickhouse
			AFTER INSERT OR UPDATE OR DELETE ON "release_cover_art"
			FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync();
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop triggers
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_labels_to_clickhouse ON "labels"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_artists_to_clickhouse ON "artists"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_channels_to_clickhouse ON "channels"`);
		await queryRunner.query(`DROP TRIGGER IF EXISTS sync_release_cover_art_to_clickhouse ON "release_cover_art"`);

		// Revert to function structure from AddVideoTriggersToSyncOutbox
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
	}
}
