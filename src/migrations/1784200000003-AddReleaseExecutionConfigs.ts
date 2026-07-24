import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReleaseExecutionConfigs1784200000003 implements MigrationInterface {
	name = 'AddReleaseExecutionConfigs1784200000003';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "release_execution_configs" (
				"id" uuid NOT NULL DEFAULT uuid_generate_v4(), 
				"created_at" TIMESTAMP NOT NULL DEFAULT now(), 
				"updated_at" TIMESTAMP NOT NULL DEFAULT now(), 
				"cleanup_cron_value" character varying NOT NULL DEFAULT '0 * * * *', 
				"step_configs" jsonb NOT NULL DEFAULT '[]', 
				CONSTRAINT "PK_release_execution_configs" PRIMARY KEY ("id")
			)`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "release_execution_configs"`);
	}
}
