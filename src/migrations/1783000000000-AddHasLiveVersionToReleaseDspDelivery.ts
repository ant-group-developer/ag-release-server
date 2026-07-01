import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasLiveVersionToReleaseDspDelivery1783000000000
	implements MigrationInterface
{
	name = 'AddHasLiveVersionToReleaseDspDelivery1783000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_dsp_delivery"
			ADD "has_live_version" boolean NOT NULL DEFAULT false
		`);

		await queryRunner.query(`
			UPDATE "release_dsp_delivery"
			SET "has_live_version" = true
			WHERE "status" = 'distributed'
			OR "last_delivered_at" IS NOT NULL
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_dsp_delivery"
			DROP COLUMN "has_live_version"
		`);
	}
}
