import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776237645543 implements MigrationInterface {
    name = 'Migration1776237645543'

    public async up(queryRunner: QueryRunner): Promise<void> {

        await queryRunner.query(`
            DELETE FROM "release_dsp_delivery" rdd
            WHERE NOT EXISTS (
                SELECT 1
                FROM "releases" r
                WHERE r.id = rdd.release_id
            )
        `);

        await queryRunner.query(`ALTER TABLE "tracks" ADD CONSTRAINT "FK_233b4896b79bc3a09fe2e7cd33e" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_artist" ADD CONSTRAINT "FK_1d817cf036975de7f3bbfecae31" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_cover_art" ADD CONSTRAINT "FK_3a6a2583bb9d384c77d45aab213" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_territories" ADD CONSTRAINT "FK_513f1ce32ea2c51d0630869efbd" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_language" ADD CONSTRAINT "FK_90744b146ead957272664ad340a" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_language" DROP CONSTRAINT "FK_90744b146ead957272664ad340a"`);
        await queryRunner.query(`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b"`);
        await queryRunner.query(`ALTER TABLE "release_territories" DROP CONSTRAINT "FK_513f1ce32ea2c51d0630869efbd"`);
        await queryRunner.query(`ALTER TABLE "release_cover_art" DROP CONSTRAINT "FK_3a6a2583bb9d384c77d45aab213"`);
        await queryRunner.query(`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1"`);
        await queryRunner.query(`ALTER TABLE "release_artist" DROP CONSTRAINT "FK_1d817cf036975de7f3bbfecae31"`);
        await queryRunner.query(`ALTER TABLE "tracks" DROP CONSTRAINT "FK_233b4896b79bc3a09fe2e7cd33e"`);
    }
}
