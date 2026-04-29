import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777453051391 implements MigrationInterface {
    name = 'Migration1777453051391'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "state51_emails" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "upc" character varying, "dsp_ci_codes" jsonb NOT NULL DEFAULT '[]', "delivery_email" character varying, "delivery_email_subject" character varying, "is_sent" boolean NOT NULL DEFAULT false, "sent_at" TIMESTAMP WITH TIME ZONE, "release_submit_step_id" uuid, "release_id" uuid, CONSTRAINT "PK_0de872367ac62c8f388d4295d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "state51_emails" ADD CONSTRAINT "FK_b9f35fa29c11e4aba2433bd2da7" FOREIGN KEY ("release_submit_step_id") REFERENCES "release_submit_steps"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "state51_emails" DROP CONSTRAINT "FK_b9f35fa29c11e4aba2433bd2da7"`);
        await queryRunner.query(`DROP TABLE "state51_emails"`);
    }

}
