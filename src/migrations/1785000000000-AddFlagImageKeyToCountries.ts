import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlagImageKeyToCountries1785000000000
	implements MigrationInterface
{
	name = 'AddFlagImageKeyToCountries1785000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER TABLE "countries" ADD COLUMN "flag_image_key" character varying(255)',
		);
		await queryRunner.query(
			"COMMENT ON COLUMN \"countries\".\"flag_image_key\" IS 'R2 public object key for the country flag SVG'",
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'ALTER TABLE "countries" DROP COLUMN "flag_image_key"',
		);
	}
}
