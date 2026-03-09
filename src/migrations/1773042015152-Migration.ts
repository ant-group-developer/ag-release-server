import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773042015152 implements MigrationInterface {
    name = 'Migration1773042015152'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audio_files" DROP CONSTRAINT "FK_65545b07c020cbdbbb7681608c2"`);
        await queryRunner.query(`ALTER TABLE "audio_files" ALTER COLUMN "peak_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "audio_files" ADD CONSTRAINT "FK_65545b07c020cbdbbb7681608c2" FOREIGN KEY ("peak_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audio_files" DROP CONSTRAINT "FK_65545b07c020cbdbbb7681608c2"`);
        await queryRunner.query(`ALTER TABLE "audio_files" ALTER COLUMN "peak_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "audio_files" ADD CONSTRAINT "FK_65545b07c020cbdbbb7681608c2" FOREIGN KEY ("peak_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
