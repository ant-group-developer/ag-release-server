import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775011509015 implements MigrationInterface {
    name = 'Migration1775011509015'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" DROP CONSTRAINT "FK_ded1cdf4d990ae55d85e273514f"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_logs" ADD CONSTRAINT "FK_ded1cdf4d990ae55d85e273514f" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
