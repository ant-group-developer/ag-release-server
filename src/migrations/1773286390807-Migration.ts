import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773286390807 implements MigrationInterface {
    name = 'Migration1773286390807'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."files_storage_provider_enum" AS ENUM('gcs', 'r2')`);
        await queryRunner.query(`ALTER TABLE "files" ADD "storage_provider" "public"."files_storage_provider_enum" NOT NULL DEFAULT 'gcs'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN "storage_provider"`);
        await queryRunner.query(`DROP TYPE "public"."files_storage_provider_enum"`);
    }

}
