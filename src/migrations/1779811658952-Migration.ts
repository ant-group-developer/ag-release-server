import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779811658952 implements MigrationInterface {
    name = 'Migration1779811658952'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" ADD "release_execution_id" uuid`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "release_execution_step_id" uuid`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_e47934017b8c4a8d72f0103e6b6" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_be9bcacef710acf6ab6baa764e5" FOREIGN KEY ("release_execution_step_id") REFERENCES "release_execution_steps3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_be9bcacef710acf6ab6baa764e5"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_e47934017b8c4a8d72f0103e6b6"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "release_execution_step_id"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "release_execution_id"`);
    }

}
