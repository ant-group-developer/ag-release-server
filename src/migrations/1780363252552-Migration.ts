import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780363252552 implements MigrationInterface {
    name = 'Migration1780363252552'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "UQ_a555af19103f2e1243777c36c49"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "UQ_a555af19103f2e1243777c36c49" UNIQUE ("isrc")`);
    }

}
