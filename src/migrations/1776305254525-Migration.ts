import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1776305254525 implements MigrationInterface {
    name = 'Migration1776305254525'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "is_active" boolean NOT NULL DEFAULT true, "role_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, CONSTRAINT "UQ_ae5f601c8f0a62c7a052046df05" UNIQUE ("tenant_id", "role_id"), CONSTRAINT "PK_98d05ed42de335d3521c86e6569" PRIMARY KEY ("id")); COMMENT ON COLUMN "tenant_roles"."is_active" IS 'Trạng thái kích hoạt role cho tenant'; COMMENT ON COLUMN "tenant_roles"."role_id" IS 'ID của role'; COMMENT ON COLUMN "tenant_roles"."tenant_id" IS 'ID của tenant'`);
        await queryRunner.query(`COMMENT ON TABLE "tenant_roles" IS 'Bảng cấu hình role được kích hoạt cho từng tenant'`);
        await queryRunner.query(`ALTER TABLE "tenant_roles" ADD CONSTRAINT "FK_5c217607934f199b9b2b4b226bf" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_roles" ADD CONSTRAINT "FK_41bd328ad585d73bf5d5ed7430a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_roles" DROP CONSTRAINT "FK_41bd328ad585d73bf5d5ed7430a"`);
        await queryRunner.query(`ALTER TABLE "tenant_roles" DROP CONSTRAINT "FK_5c217607934f199b9b2b4b226bf"`);
        await queryRunner.query(`COMMENT ON TABLE "tenant_roles" IS NULL`);
        await queryRunner.query(`DROP TABLE "tenant_roles"`);
    }
}
