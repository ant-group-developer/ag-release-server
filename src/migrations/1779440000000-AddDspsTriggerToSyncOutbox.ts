import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDspsTriggerToSyncOutbox1779440000000 implements MigrationInterface {
    name = 'AddDspsTriggerToSyncOutbox1779440000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add trigger for dsps table - uses queue_and_notify_sync() function
        // that was created in AddClickHouseSyncOutbox migration
        await queryRunner.query(`
            CREATE OR REPLACE TRIGGER sync_dsps_to_clickhouse
            AFTER INSERT OR UPDATE OR DELETE ON dsps
            FOR EACH ROW EXECUTE FUNCTION queue_and_notify_sync()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS sync_dsps_to_clickhouse ON dsps`);
    }
}