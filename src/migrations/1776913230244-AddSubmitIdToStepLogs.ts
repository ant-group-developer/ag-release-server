import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubmitIdToStepLogs1776913230244 implements MigrationInterface {
    name = 'AddSubmitIdToStepLogs1776913230244'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" ADD "release_submit_id" uuid`);
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" ADD CONSTRAINT "FK_6eab8bdd164e45834abf95232b3" FOREIGN KEY ("release_submit_id") REFERENCES "release_submits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" DROP CONSTRAINT "FK_6eab8bdd164e45834abf95232b3"`);
        await queryRunner.query(`ALTER TABLE "release_submit_step_logs" DROP COLUMN "release_submit_id"`);
    }

}
