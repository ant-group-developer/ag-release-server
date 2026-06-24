import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateLabelAntRecordsToAmg1781362000000
	implements MigrationInterface
{
	name = 'MigrateLabelAntRecordsToAmg1781362000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			DO $$
			DECLARE
				v_tenant_id UUID;
				v_old_label_id VARCHAR(10);
				v_new_label_id VARCHAR(10);
			BEGIN
				-- 1. Find the tenant "ANT MUSIC LLC"
				SELECT id INTO v_tenant_id FROM tenants WHERE name = 'ANT MUSIC LLC' OR title = 'ANT MUSIC LLC' LIMIT 1;
				
				IF v_tenant_id IS NULL THEN
					RAISE EXCEPTION 'Tenant "ANT MUSIC LLC" not found in database.';
				END IF;

				-- 2. Find the target label "AMG" belonging to the tenant "ANT MUSIC LLC"
				SELECT id INTO v_new_label_id FROM labels WHERE name = 'AMG' AND tenant_id = v_tenant_id LIMIT 1;

				IF v_new_label_id IS NULL THEN
					RAISE EXCEPTION 'Target label "AMG" belonging to tenant "ANT MUSIC LLC" not found in database.';
				END IF;

				-- 3. Find the old label "ANT Records / ADA"
				SELECT id INTO v_old_label_id FROM labels WHERE name = 'ANT Records / ADA' LIMIT 1;

				-- 4. If the old label exists, migrate the releases and delete the old label
				IF v_old_label_id IS NOT NULL THEN
					-- Update releases: point to new label ID and update tenant ID to ANT MUSIC LLC
					UPDATE releases 
					SET label_id = v_new_label_id, tenant_id = v_tenant_id
					WHERE label_id = v_old_label_id;

					-- Delete the old label
					DELETE FROM labels WHERE id = v_old_label_id;
					
					RAISE NOTICE 'Successfully migrated releases from label "ANT Records / ADA" (%) to "AMG" (%) and deleted the old label.', v_old_label_id, v_new_label_id;
				ELSE
					RAISE NOTICE 'Old label "ANT Records / ADA" not found, no releases to migrate.';
				END IF;
			END $$;
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Data migration correction: rollback is not safely reversible without keeping track of old release IDs.
		await queryRunner.query(`SELECT 1`);
	}
}
