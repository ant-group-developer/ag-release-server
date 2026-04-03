import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775210666205 implements MigrationInterface {
    name = 'Migration1775210666205'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "artist_roles" ADD "is_required" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "artist_roles"."is_required" IS 'Xác định bắt buộc phải có vai trò này ở trong release hoặc track hay không'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "artist_roles"."is_required" IS 'Xác định bắt buộc phải có vai trò này ở trong release hoặc track hay không'`);
        await queryRunner.query(`ALTER TABLE "artist_roles" DROP COLUMN "is_required"`);
    }

}
