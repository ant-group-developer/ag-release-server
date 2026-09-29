import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetImportBatchFileKey1790300000000
	implements MigrationInterface
{
	name = 'AddAssetImportBatchFileKey1790300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "asset_import_batches"
			ADD COLUMN IF NOT EXISTS "file_key" character varying(1000)
		`);
		await queryRunner.query(`
			COMMENT ON COLUMN "asset_import_batches"."file_key" IS
			'Object key của file Excel đã upload lên R2 và được dùng để scan'
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "asset_import_batches"
			DROP COLUMN IF EXISTS "file_key"
		`);
	}
}
