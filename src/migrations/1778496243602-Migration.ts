import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778496243602 implements MigrationInterface {
    name = 'Migration1778496243602'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17"`);
        await queryRunner.query(`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17"`);
        await queryRunner.query(`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
