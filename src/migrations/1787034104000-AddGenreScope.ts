import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenreScope1787034104000 implements MigrationInterface {
	name = 'AddGenreScope1787034104000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "genres" ADD COLUMN "scope" varchar(20) NOT NULL DEFAULT 'audio'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."scope" IS 'Phạm vi áp dụng: audio | video | both'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "genres" DROP COLUMN "scope"`);
	}
}
