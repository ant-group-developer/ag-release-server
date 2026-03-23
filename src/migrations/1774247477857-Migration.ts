import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1774247477857 implements MigrationInterface {
    name = 'Migration1774247477857'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125"`);
        await queryRunner.query(`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125"`);
        await queryRunner.query(`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
