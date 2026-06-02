import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780365233289 implements MigrationInterface {
    name = 'Migration1780365233289'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "video_genres" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "video_id" uuid NOT NULL, "genre_id" character varying(10) NOT NULL, CONSTRAINT "UQ_5f078866d542ad034aeae086841" UNIQUE ("video_id", "genre_id"), CONSTRAINT "PK_6bc9a463ff5284af0d74bff5fb9" PRIMARY KEY ("id")); COMMENT ON COLUMN "video_genres"."video_id" IS 'ID video'; COMMENT ON COLUMN "video_genres"."genre_id" IS 'ID genre'`);
        await queryRunner.query(`COMMENT ON TABLE "video_genres" IS 'Bảng liên kết genre với video - quan hệ nhiều nhiều'`);
        await queryRunner.query(`ALTER TABLE "video_genres" ADD CONSTRAINT "FK_8653ec24ab6e06090c8802cd595" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_genres" ADD CONSTRAINT "FK_6ac2627bc56786632542b01bd33" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_genres" DROP CONSTRAINT "FK_6ac2627bc56786632542b01bd33"`);
        await queryRunner.query(`ALTER TABLE "video_genres" DROP CONSTRAINT "FK_8653ec24ab6e06090c8802cd595"`);
        await queryRunner.query(`COMMENT ON TABLE "video_genres" IS NULL`);
        await queryRunner.query(`DROP TABLE "video_genres"`);
    }

}
