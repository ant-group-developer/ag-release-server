import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAppConfig1754294389399 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// ensure uuid generator
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

		await queryRunner.createTable(
			new Table({
				name: 'app_config',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						default: 'uuid_generate_v4()',
					},
					{
						name: 'config',
						type: 'jsonb',
						isNullable: false,
					},
					{
						name: 'created_at',
						type: 'timestamptz',
						default: 'NOW()',
					},
					{
						name: 'updated_at',
						type: 'timestamptz',
						default: 'NOW()',
					},
				],
			}),
			true, // ifNotExist
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('app_config');
	}
}
