import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * channel_delivery: thêm is_cluster + member_dsp_codes cho CI cluster channel.
 *
 * Cluster gom N DSP cùng aggregator chạy shared-stages (deliver/ingest/qa/export) 1 lần;
 * member_dsp_codes giữ [{dspCode, exportMethod?, hasDeal?}] để fan-out watcher go-live + export
 * distinct-method sau khi load lại. Channel thường (direct/watcher): is_cluster=false, [].
 */
export class ChannelDeliveryClusterColumns1785200000000
	implements MigrationInterface
{
	name = 'ChannelDeliveryClusterColumns1785200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "channel_delivery"
				ADD COLUMN "is_cluster" boolean NOT NULL DEFAULT false,
				ADD COLUMN "member_dsp_codes" jsonb NOT NULL DEFAULT '[]'::jsonb
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "channel_delivery"
				DROP COLUMN "member_dsp_codes",
				DROP COLUMN "is_cluster"
		`);
	}
}
