import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorIdToReleaseExecution31787890000000
	implements MigrationInterface
{
	name = 'AddCreatorIdToReleaseExecution31787890000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_excutions3"
			ADD COLUMN "creator_id" uuid
		`);

		await queryRunner.query(`
			ALTER TABLE "release_excutions3"
			ADD CONSTRAINT "fk_release_excutions3_creator"
			FOREIGN KEY ("creator_id")
			REFERENCES "users"("id")
			ON DELETE NO ACTION
			ON UPDATE NO ACTION
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE "release_excutions3"
			DROP CONSTRAINT "fk_release_excutions3_creator"
		`);

		await queryRunner.query(`
			ALTER TABLE "release_excutions3"
			DROP COLUMN "creator_id"
		`);
	}
}
