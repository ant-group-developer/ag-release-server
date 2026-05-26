import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779329933163 implements MigrationInterface {
    name = 'Migration1779329933163'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_track_artist_track_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_track_contributors_track_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_release_artist_release_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_release_contributors_release_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_release_cover_art_release_id"`);
        await queryRunner.query(`CREATE TABLE "release_excutions3" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying(50) NOT NULL, "release_title" character varying(255) NOT NULL, "release_upc" character varying(255) NOT NULL, "release_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'NEW', "completed_at" TIMESTAMP WITH TIME ZONE, "summary" text, "metadata" jsonb, CONSTRAINT "PK_e3aa3ad61fa9074d34239a1a7cb" PRIMARY KEY ("id")); COMMENT ON COLUMN "release_excutions3"."type" IS 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)'; COMMENT ON COLUMN "release_excutions3"."summary" IS 'Summary or error message'; COMMENT ON COLUMN "release_excutions3"."metadata" IS 'Input data: releaseSnapshot, config, etc.'`);
        await queryRunner.query(`CREATE TABLE "release_execution_steps3" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_execution_id" uuid NOT NULL, "parent_step_id" uuid, "type" character varying(50) NOT NULL, "status" character varying NOT NULL DEFAULT 'NEW', "order" integer NOT NULL DEFAULT '0', "metadata" jsonb, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "child_execution_mode" character varying NOT NULL DEFAULT 'sequential', CONSTRAINT "PK_a958954b97137e375d554267a6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "release_excutions3" ADD CONSTRAINT "FK_efa744164a737109e08d12b2040" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" ADD CONSTRAINT "FK_606dc3e22318b6e64bd72ee3460" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" ADD CONSTRAINT "FK_257fed25ada09a38d41a02c4c2b" FOREIGN KEY ("parent_step_id") REFERENCES "release_execution_steps3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" DROP CONSTRAINT "FK_257fed25ada09a38d41a02c4c2b"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" DROP CONSTRAINT "FK_606dc3e22318b6e64bd72ee3460"`);
        await queryRunner.query(`ALTER TABLE "release_excutions3" DROP CONSTRAINT "FK_efa744164a737109e08d12b2040"`);
        await queryRunner.query(`DROP TABLE "release_execution_steps3"`);
        await queryRunner.query(`DROP TABLE "release_excutions3"`);
        await queryRunner.query(`CREATE INDEX "IDX_release_cover_art_release_id" ON "release_cover_art" ("release_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_release_contributors_release_id" ON "release_contributors" ("release_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_release_artist_release_id" ON "release_artist" ("release_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_track_contributors_track_id" ON "track_contributors" ("track_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_track_artist_track_id" ON "track_artist" ("track_id") `);
    }

}
