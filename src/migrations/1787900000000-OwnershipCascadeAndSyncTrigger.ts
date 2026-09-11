import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnershipCascadeAndSyncTrigger1787900000000
	implements MigrationInterface
{
	name = 'OwnershipCascadeAndSyncTrigger1787900000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Doi FK release_id tu RESTRICT sang CASCADE cho ca 2 bang ownership.
		//    Tra cuu dynamic ten constraint tu pg_constraint (khong hardcode ten
		//    do PostgreSQL tu sinh, vd <table>_release_id_fkey).
		await queryRunner.query(`
			DO $$
			DECLARE
			  r RECORD;
			BEGIN
			  FOR r IN
			    SELECT con.conname AS cname, cl.relname AS tname
			    FROM pg_constraint con
			    JOIN pg_class cl ON cl.oid = con.conrelid
			    JOIN pg_class rl ON rl.oid = con.confrelid
			    WHERE rl.relname = 'releases'
			      AND con.contype = 'f'
			      AND cl.relname IN ('asset_ownership_periods', 'asset_ownership_transfer_events')
			  LOOP
			    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tname, r.cname);
			    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %s FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE',
			      r.tname, quote_ident(r.cname));
			  END LOOP;
			END $$;
		`);

		// 2. Trigger AFTER INSERT/UPDATE/DELETE tren asset_ownership_periods de
		//    enqueue job sync sang clickhouse_sync_outbox. Trigger ban chay ca khi
		//    row bi xoa do CASCADE tu lenh xoa release (khong can code xoa release
		//    biet gi ve ownership). entity_id la release_id, khong phai PK cua row.
		await queryRunner.query(`
			CREATE OR REPLACE FUNCTION queue_ownership_sync() RETURNS trigger AS $$
			BEGIN
			  IF (TG_OP = 'DELETE') THEN
			    INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
			    VALUES ('asset_ownership_periods', OLD.release_id::varchar, 'DELETE', FALSE)
			    ON CONFLICT (entity_name, entity_id) WHERE processed = FALSE
			    DO UPDATE SET created_at = CURRENT_TIMESTAMP,
			      action = CASE WHEN EXCLUDED.action = 'DELETE' THEN 'DELETE' ELSE clickhouse_sync_outbox.action END,
			      error_message = NULL;
			    PERFORM pg_notify('clickhouse_sync_channel', 'asset_ownership_periods');
			    RETURN OLD;
			  ELSE
			    INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
			    VALUES ('asset_ownership_periods', NEW.release_id::varchar, 'UPDATE', FALSE)
			    ON CONFLICT (entity_name, entity_id) WHERE processed = FALSE
			    DO UPDATE SET created_at = CURRENT_TIMESTAMP,
			      action = CASE WHEN EXCLUDED.action = 'DELETE' THEN 'DELETE' ELSE clickhouse_sync_outbox.action END,
			      error_message = NULL;
			    PERFORM pg_notify('clickhouse_sync_channel', 'asset_ownership_periods');
			    RETURN NEW;
			  END IF;
			END;
			$$ LANGUAGE plpgsql;
		`);

		await queryRunner.query(`
			CREATE TRIGGER asset_ownership_periods_sync_trigger
			AFTER INSERT OR UPDATE OR DELETE ON asset_ownership_periods
			FOR EACH ROW EXECUTE FUNCTION queue_ownership_sync()
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'DROP TRIGGER IF EXISTS asset_ownership_periods_sync_trigger ON asset_ownership_periods',
		);
		await queryRunner.query('DROP FUNCTION IF EXISTS queue_ownership_sync()');

		await queryRunner.query(`
			DO $$
			DECLARE
			  r RECORD;
			BEGIN
			  FOR r IN
			    SELECT con.conname AS cname, cl.relname AS tname
			    FROM pg_constraint con
			    JOIN pg_class cl ON cl.oid = con.conrelid
			    JOIN pg_class rl ON rl.oid = con.confrelid
			    WHERE rl.relname = 'releases'
			      AND con.contype = 'f'
			      AND cl.relname IN ('asset_ownership_periods', 'asset_ownership_transfer_events')
			  LOOP
			    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tname, r.cname);
			    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %s FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE RESTRICT',
			      r.tname, quote_ident(r.cname));
			  END LOOP;
			END $$;
		`);
	}
}
