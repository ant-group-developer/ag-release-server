import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773718373956 implements MigrationInterface {
    name = 'Migration1773718373956'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "track_contributors" DROP CONSTRAINT "FK_d5d963070db3c19968c193f778d"`);
        await queryRunner.query(`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1"`);
        await queryRunner.query(`ALTER TABLE "track_contributors" ADD CONSTRAINT "FK_d5d963070db3c19968c193f778d" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1"`);
        await queryRunner.query(`ALTER TABLE "track_contributors" DROP CONSTRAINT "FK_d5d963070db3c19968c193f778d"`);
        await queryRunner.query(`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "track_contributors" ADD CONSTRAINT "FK_d5d963070db3c19968c193f778d" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
