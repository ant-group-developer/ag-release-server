import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenOutboxJobId1784800000000 implements MigrationInterface {
	name = 'WidenOutboxJobId1784800000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "outbox_event"
				ALTER COLUMN "job_id" TYPE varchar(255)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "outbox_event"
				ALTER COLUMN "job_id" TYPE varchar(120)
		`);
	}
}
