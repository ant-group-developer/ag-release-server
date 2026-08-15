import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssetOwnershipLedger1786100000000 implements MigrationInterface {
	name = 'CreateAssetOwnershipLedger1786100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE asset_ownership_transfer_events (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
				release_id uuid NOT NULL REFERENCES releases(id) ON DELETE RESTRICT,
				from_tenant_id uuid, from_label_id varchar(10),
				to_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
				to_label_id varchar(10), effective_date date NOT NULL,
				revenue_effective_from date NOT NULL,
				source varchar(40) NOT NULL DEFAULT 'asset_import', asset_import_item_id uuid UNIQUE,
				created_by uuid, note text
			)
		`);
		await queryRunner.query(`
			CREATE TABLE asset_ownership_periods (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
				release_id uuid NOT NULL REFERENCES releases(id) ON DELETE RESTRICT,
				tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
				label_id varchar(10), effective_from date NOT NULL, effective_to date,
				revenue_effective_from date NOT NULL, revenue_effective_to date,
				asset_import_item_id uuid UNIQUE, created_by uuid,
				CONSTRAINT chk_asset_ownership_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from),
				CONSTRAINT chk_asset_ownership_revenue_range CHECK (revenue_effective_to IS NULL OR revenue_effective_to > revenue_effective_from)
			)
		`);
		await queryRunner.query('CREATE INDEX idx_asset_ownership_period_release_from ON asset_ownership_periods(release_id, effective_from)');
		await queryRunner.query('CREATE INDEX idx_asset_ownership_period_tenant_from ON asset_ownership_periods(tenant_id, effective_from)');
		await queryRunner.query('CREATE INDEX idx_asset_ownership_period_label_from ON asset_ownership_periods(label_id, effective_from)');
		await queryRunner.query(`
			INSERT INTO asset_ownership_periods
				(release_id, tenant_id, label_id, effective_from, revenue_effective_from)
			SELECT id, tenant_id, label_id, DATE '1900-01-01', DATE '1900-01-01'
			FROM releases
			WHERE tenant_id IS NOT NULL
		`);
		await queryRunner.query(`
			CREATE FUNCTION prevent_asset_ownership_period_overlap()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				-- One transaction-scoped lock serializes ownership writes. A fixed lock,
				-- rather than one lock per release, also permits large bulk inserts without
				-- exhausting PostgreSQL's max_locks_per_transaction setting.
				PERFORM pg_advisory_xact_lock(hashtext('asset_ownership_periods_overlap'));

				IF EXISTS (
					SELECT 1
					FROM asset_ownership_periods AS existing
					WHERE existing.release_id = NEW.release_id
						AND existing.id <> NEW.id
						AND existing.effective_from < COALESCE(NEW.effective_to, 'infinity'::date)
						AND NEW.effective_from < COALESCE(existing.effective_to, 'infinity'::date)
				) THEN
					RAISE EXCEPTION USING
						ERRCODE = '23P01',
						MESSAGE = 'Asset ownership effective periods cannot overlap for the same release';
				END IF;

				RETURN NEW;
			END;
			$$
		`);
		await queryRunner.query(`
			CREATE TRIGGER asset_ownership_periods_prevent_overlap
			BEFORE INSERT OR UPDATE OF release_id, effective_from, effective_to
			ON asset_ownership_periods
			FOR EACH ROW
			EXECUTE FUNCTION prevent_asset_ownership_period_overlap()
		`);
		await queryRunner.query(`ALTER TABLE asset_import_batches ADD COLUMN effective_date date NOT NULL DEFAULT CURRENT_DATE`);
		await queryRunner.query(`ALTER TABLE asset_import_batches ADD COLUMN revenue_effective_from date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('ALTER TABLE asset_import_batches DROP COLUMN IF EXISTS revenue_effective_from');
		await queryRunner.query('ALTER TABLE asset_import_batches DROP COLUMN IF EXISTS effective_date');
		await queryRunner.query('DROP TABLE IF EXISTS asset_ownership_periods');
		await queryRunner.query('DROP FUNCTION IF EXISTS prevent_asset_ownership_period_overlap()');
		await queryRunner.query('DROP TABLE IF EXISTS asset_ownership_transfer_events');
	}
}
