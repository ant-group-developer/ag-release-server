import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778209075674 implements MigrationInterface {
    name = 'Migration1778209075674'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_6eab8bdd164e45834abf95232b3"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_bf950b310113077973dc74e35a5"`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "type" character varying NOT NULL DEFAULT 'SYSTEM'`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "module" character varying DEFAULT 'LOG'`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "level"`);
        await queryRunner.query(`DROP TYPE "public"."release_submit_step_logs_level_enum"`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "level" character varying NOT NULL DEFAULT 'LOG'`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_4ad49f2a02e89d0509bd22c5210" FOREIGN KEY ("release_submit_id") REFERENCES "release_submits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_e99535b5fdb0c04ede1e58d0de4" FOREIGN KEY ("release_submit_step_id") REFERENCES "release_submit_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_e99535b5fdb0c04ede1e58d0de4"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_4ad49f2a02e89d0509bd22c5210"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "level"`);
        await queryRunner.query(`CREATE TYPE "public"."release_submit_step_logs_level_enum" AS ENUM('SUCCESS', 'LOG', 'ERROR', 'WARNING')`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "level" "public"."release_submit_step_logs_level_enum" NOT NULL DEFAULT 'LOG'`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "module"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_bf950b310113077973dc74e35a5" FOREIGN KEY ("release_submit_step_id") REFERENCES "release_submit_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_6eab8bdd164e45834abf95232b3" FOREIGN KEY ("release_submit_id") REFERENCES "release_submits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
