import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 Step 5b — thêm cột `channel_specs` jsonb cho `distribution`.
 *
 * Lý do: sau save → load, `Distribution.rehydrate` cần specs để `ensureChannelsSpawned`
 * hoạt động ở transition `markValidated`/`approveReview`/`markPackageBuilt`. Không lưu
 * specs = load về mất _channelSpecs → 0 channel spawned ở lần vào DELIVERING.
 *
 * Immutable: chỉ set 1 lần lúc INSERT (fresh aggregate). Không có ALTER command trong
 * repo — không expose method mutate specs.
 */
export class AddDistributionChannelSpecs1784200000001
	implements MigrationInterface
{
	name = 'AddDistributionChannelSpecs1784200000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "distribution" ADD "channel_specs" jsonb NOT NULL DEFAULT '[]'::jsonb`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "distribution" DROP COLUMN "channel_specs"`,
		);
	}
}
