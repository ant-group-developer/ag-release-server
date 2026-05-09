import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778234738423 implements MigrationInterface {
	name = 'Migration1778234738423';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			INSERT INTO labels (
				id,
				creator_id,
				modifier_id,
				code,
				name,
				picture,
				description,
				tenant_id
			)
			VALUES (
				'cfbQbWfEmo',
				'8554043d-a902-43fe-b4c4-40a22b93dfe2',
				'8554043d-a902-43fe-b4c4-40a22b93dfe2',
				'AMG',
				'AMG',
				'https://ui-avatars.com/api/?name=AMG&size=128&font-size=0.4&background=6D28D9&color=FFFFFF&length=2&rounded=false&uppercase=true&bold=false&format=png',
				NULL,
				'f3bd3be7-15ad-4d00-8644-cffd4da82cba'
			)
			ON CONFLICT (id) DO NOTHING
		`);

		await queryRunner.query(`
			UPDATE releases r
			SET
				tenant_id = 'f3bd3be7-15ad-4d00-8644-cffd4da82cba',
				label_id = 'cfbQbWfEmo'
			WHERE r.upc IN (
				'7798426700934',
				'7798424739905',
				'7316480630778',
				'7316480630709',
				'7316480550533',
				'7316480596227',
				'7316480865927'
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE releases r
			SET
				tenant_id = NULL,
				label_id = NULL
			WHERE r.upc IN (
				'7798426700934',
				'7798424739905',
				'7316480630778',
				'7316480630709',
				'7316480550533',
				'7316480596227',
				'7316480865927'
			)
		`);

		await queryRunner.query(`
			DELETE FROM labels
			WHERE id = 'cfbQbWfEmo'
		`);
	}
}