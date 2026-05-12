import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778208928061 implements MigrationInterface {
	name = 'Migration1778208928061';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_submit_step_logs"
			RENAME TO "logs"
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "logs"
			RENAME TO "release_submit_step_logs"
		`);
	}
}