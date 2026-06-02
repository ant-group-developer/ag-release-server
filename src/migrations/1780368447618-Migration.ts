import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780368447618 implements MigrationInterface {
    name = 'Migration1780368447618'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" ADD "visibility" character varying(50) DEFAULT 'DEFAULT'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."visibility" IS 'Visibility của video: Default, Unlisted on YouTube, Unlisted on Vevo, Unlisted on YouTube/VevoNullable when status is draft'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "videos"."visibility" IS 'Visibility của video: Default, Unlisted on YouTube, Unlisted on Vevo, Unlisted on YouTube/VevoNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "visibility"`);
    }

}
