import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775032529091 implements MigrationInterface {
    name = 'Migration1775032529091'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "price_tiers" ADD "order" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."order" IS 'Thứ tự hiển thị'`);
        await queryRunner.query(`ALTER TABLE "price_tiers" ADD "ci_code" character varying(200) NOT NULL DEFAULT 'mid'`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."ci_code" IS 'Mã CI'`);
        await queryRunner.query(`CREATE TYPE "public"."price_tiers_type_enum" AS ENUM('album', 'track')`);
        await queryRunner.query(`ALTER TABLE "price_tiers" ADD "type" "public"."price_tiers_type_enum" NOT NULL DEFAULT 'track'`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."type" IS 'Loại price tier (album/track)'`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "price_tier_id" uuid`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."price_tier_id" IS 'Price tier áp dụng cho release Nullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "releases" ADD CONSTRAINT "FK_13f315bee28f29049fbc8244ae0" FOREIGN KEY ("price_tier_id") REFERENCES "price_tiers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "releases" DROP CONSTRAINT "FK_13f315bee28f29049fbc8244ae0"`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."price_tier_id" IS 'Price tier áp dụng cho release Nullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "price_tier_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."type" IS 'Loại price tier (album/track)'`);
        await queryRunner.query(`ALTER TABLE "price_tiers" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."price_tiers_type_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."ci_code" IS 'Mã CI'`);
        await queryRunner.query(`ALTER TABLE "price_tiers" DROP COLUMN "ci_code"`);
        await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."order" IS 'Thứ tự hiển thị'`);
        await queryRunner.query(`ALTER TABLE "price_tiers" DROP COLUMN "order"`);
    }

}
