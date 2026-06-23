import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1780645568414 implements MigrationInterface {
	name = 'Migration1780645568414';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "is_unlisted"`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "videos" ADD "is_unlisted" boolean DEFAULT false`,
		);
	}
}
