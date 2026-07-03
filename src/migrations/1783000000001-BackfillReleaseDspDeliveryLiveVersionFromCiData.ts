import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillReleaseDspDeliveryLiveVersionFromCiData1783000000001
	implements MigrationInterface
{
	name = 'BackfillReleaseDspDeliveryLiveVersionFromCiData1783000000001';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "release_dsp_delivery" rdd
			SET "has_live_version" = true
			FROM "release_ci_data" rcd
			INNER JOIN LATERAL jsonb_array_elements(rcd."export_parsed_data") AS export_item("value") ON true
			INNER JOIN "dsps" dsp
				ON dsp."code_ci" = substring(
					export_item."value" ->> 'deliveryPoint'
					FROM '\\(([^()]*)\\)\\s*$'
				)
			WHERE rdd."release_id" = rcd."release_id"
			AND rdd."dsp_id" = dsp."id"
			AND lower(coalesce(export_item."value" ->> 'deliveryPointStatus', '')) = 'live'
			AND substring(
				export_item."value" ->> 'deliveryPoint'
				FROM '\\(([^()]*)\\)\\s*$'
			) IS NOT NULL
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`SELECT 1`);
	}
}
