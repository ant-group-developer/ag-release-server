import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777890351088 implements MigrationInterface {
    name = 'Migration1777890351088'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD CONSTRAINT "FK_671a22ce01782a514437a49c414" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP CONSTRAINT "FK_671a22ce01782a514437a49c414"`);
    }

}
