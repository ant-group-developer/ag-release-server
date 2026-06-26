import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeToDsps1781364000000 implements MigrationInterface {
	name = 'AddTypeToDsps1781364000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "dsps" ADD "type" varchar(20) NOT NULL DEFAULT 'audio'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."type" IS 'DSP type: audio (releases & tracks) or video (releases & videos)'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "dsps" DROP COLUMN "type"`,
		);
	}
}
