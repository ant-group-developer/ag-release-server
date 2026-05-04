import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777858621775 implements MigrationInterface {
    name = 'Migration1777858621775'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ci_distribution_jobs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying(30) NOT NULL, "upc" character varying, "dsp_ci_codes" jsonb NOT NULL DEFAULT '[]', "release_submit_id" uuid NOT NULL, "step_id" uuid NOT NULL, "release_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "delivery_email" character varying, "delivery_email_subject" character varying, "sent_at" TIMESTAMP WITH TIME ZONE, "step_label" character varying, CONSTRAINT "PK_cf6378dd2abfa9b0c42b7463015" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD CONSTRAINT "FK_b7853a240a5b430aec08e68c71e" FOREIGN KEY ("release_submit_id") REFERENCES "release_submits"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD CONSTRAINT "FK_79d155b757da78cb3a0114da55e" FOREIGN KEY ("step_id") REFERENCES "release_submit_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP CONSTRAINT "FK_79d155b757da78cb3a0114da55e"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP CONSTRAINT "FK_b7853a240a5b430aec08e68c71e"`);
        await queryRunner.query(`DROP TABLE "ci_distribution_jobs"`);
    }

}
