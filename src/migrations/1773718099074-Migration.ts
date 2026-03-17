import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773718099074 implements MigrationInterface {
    name = 'Migration1773718099074'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "FK_0fb50fcb3d9e592111076ac413d" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "FK_0fb50fcb3d9e592111076ac413d"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
