import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReleaseExecutionStepDeliveryFlag1780248000000
	implements MigrationInterface
{
	name = 'AddReleaseExecutionStepDeliveryFlag1780248000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_execution_steps3"
			ADD "is_delivery_step" boolean NOT NULL DEFAULT false
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_execution_steps3"
			DROP COLUMN "is_delivery_step"
		`);
	}
}
