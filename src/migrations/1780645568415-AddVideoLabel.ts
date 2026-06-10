import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoLabel1780645568415 implements MigrationInterface {
	name = 'AddVideoLabel1780645568415';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "videos" ADD "label" text`);
		await queryRunner.query(
			`COMMENT ON COLUMN "videos"."label" IS 'Label text used for video releases when generating metadataNullable when status is draft'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "label"`);
	}
}
