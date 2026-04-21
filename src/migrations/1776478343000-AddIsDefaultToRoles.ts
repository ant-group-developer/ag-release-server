import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDefaultToRoles1776478343000 implements MigrationInterface {
    name = 'AddIsDefaultToRoles1776478343000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" ADD "is_default" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`COMMENT ON COLUMN "roles"."is_default" IS 'Vai trò mặc định cho tenant chưa cấu hình'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "is_default"`);
    }
}
