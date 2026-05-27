import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779877476021 implements MigrationInterface {
    name = 'Migration1779877476021'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "ci_distribution_jobs3" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying(30) NOT NULL, "upc" character varying, "note" character varying, "dsp_ci_codes" jsonb NOT NULL DEFAULT '[]', "release_execution_id" uuid NOT NULL, "step_id" uuid NOT NULL, "release_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'pending', "delivery_email" character varying, "delivery_email_subject" character varying, "sent_at" TIMESTAMP WITH TIME ZONE, "step_label" character varying, CONSTRAINT "PK_2169fdcfa7372ee28ff9ae1d918" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_cadd4c3c22fea15a7ec895d5796" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_dc5219499b495fe78c391348039" FOREIGN KEY ("step_id") REFERENCES "release_execution_steps3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_ce6f9dd900ce79b3f762f4584f4" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_ce6f9dd900ce79b3f762f4584f4"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_dc5219499b495fe78c391348039"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_cadd4c3c22fea15a7ec895d5796"`);
        await queryRunner.query(`DROP TABLE "ci_distribution_jobs3"`);
    }

}
