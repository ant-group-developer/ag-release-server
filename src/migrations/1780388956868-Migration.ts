import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780388956868 implements MigrationInterface {
    name = 'Migration1780388956868'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "release_captions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_id" uuid NOT NULL, "language_id" uuid NOT NULL, "type" character varying(20) NOT NULL DEFAULT 'CAPTION', "file_id" uuid NOT NULL, CONSTRAINT "REL_6effaa205e32fe0be1ae6e0cff" UNIQUE ("file_id"), CONSTRAINT "PK_87e720c356b09393770b7b4e24f" PRIMARY KEY ("id")); COMMENT ON COLUMN "release_captions"."release_id" IS 'ID release owning this caption'; COMMENT ON COLUMN "release_captions"."language_id" IS 'ID language selected for this caption/subtitle'; COMMENT ON COLUMN "release_captions"."type" IS 'Caption file type: SUBTITLE or CAPTION'; COMMENT ON COLUMN "release_captions"."file_id" IS 'Caption file id in bucket files table'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_release_captions_release_id_language_id_type" ON "release_captions" ("release_id", "language_id", "type") `);
        await queryRunner.query(`COMMENT ON TABLE "release_captions" IS 'Caption/subtitle files attached to a release, unique by language and type'`);
        await queryRunner.query(`CREATE TABLE "video_artist" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "artist_id" character varying(10) NOT NULL, "video_id" uuid NOT NULL, CONSTRAINT "UQ_1ecbe87b825aa1c5995ac9ad008" UNIQUE ("artist_id", "video_id"), CONSTRAINT "PK_9c0fa2f6942d46c9d6d04b6ccdb" PRIMARY KEY ("id")); COMMENT ON COLUMN "video_artist"."artist_id" IS 'ID nghe si tham gia video'; COMMENT ON COLUMN "video_artist"."video_id" IS 'ID video'`);
        await queryRunner.query(`COMMENT ON TABLE "video_artist" IS 'Bang lien ket nghe si tham gia tung video'`);
        await queryRunner.query(`CREATE TABLE "video_contributors" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "artist_id" character varying(10) NOT NULL, "artist_role_id" uuid NOT NULL, "video_id" uuid NOT NULL, CONSTRAINT "UQ_003ae58f2c9a296e6ae6433d054" UNIQUE ("artist_id", "artist_role_id", "video_id"), CONSTRAINT "PK_7cd7fb354593f2eb48cbbd74d3f" PRIMARY KEY ("id")); COMMENT ON COLUMN "video_contributors"."artist_id" IS 'ID nghe si tham gia video'; COMMENT ON COLUMN "video_contributors"."artist_role_id" IS 'ID vai tro cua nghe si trong video'; COMMENT ON COLUMN "video_contributors"."video_id" IS 'ID video'`);
        await queryRunner.query(`COMMENT ON TABLE "video_contributors" IS 'Bang lien ket contributor tham gia tung video'`);
        await queryRunner.query(`CREATE TABLE "video_genres" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "video_id" uuid NOT NULL, "genre_id" character varying(10) NOT NULL, CONSTRAINT "UQ_5f078866d542ad034aeae086841" UNIQUE ("video_id", "genre_id"), CONSTRAINT "PK_6bc9a463ff5284af0d74bff5fb9" PRIMARY KEY ("id")); COMMENT ON COLUMN "video_genres"."video_id" IS 'ID video'; COMMENT ON COLUMN "video_genres"."genre_id" IS 'ID genre'`);
        await queryRunner.query(`COMMENT ON TABLE "video_genres" IS 'Bảng liên kết genre với video - quan hệ nhiều nhiều'`);
        await queryRunner.query(`CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "creator_id" uuid, "modifier_id" uuid, "release_id" uuid NOT NULL, "isrc" character varying(20), "explicit" boolean DEFAULT false, "ai_content" character varying(20) DEFAULT 'UNDETERMINED', "channel" character varying(150), "description" text, "keywords" jsonb, "is_kids" boolean DEFAULT false, "is_unlisted" boolean DEFAULT false, "visibility" character varying(50) DEFAULT 'DEFAULT', "content_provider" character varying(100), "copyright_owner" character varying(150), "partner_custom_id_1" character varying(100), "partner_custom_id_2" character varying(100), "file_id" uuid, CONSTRAINT "UQ_602c6c7411446bf7eb3cf25e825" UNIQUE ("release_id"), CONSTRAINT "REL_602c6c7411446bf7eb3cf25e82" UNIQUE ("release_id"), CONSTRAINT "REL_9169ec60e4033dacf6cacec14c" UNIQUE ("file_id"), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id")); COMMENT ON COLUMN "videos"."release_id" IS 'Liên kết 1:1 sang thực thể Release sở hữu Video này'; COMMENT ON COLUMN "videos"."isrc" IS 'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi videoNullable when status is draft'; COMMENT ON COLUMN "videos"."explicit" IS 'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổiNullable when status is draft'; COMMENT ON COLUMN "videos"."ai_content" IS 'Trang thai noi dung AI cua video theo VEVO: ALL, PARTLY, NONE, UNDETERMINEDNullable when status is draft'; COMMENT ON COLUMN "videos"."channel" IS 'Tên kênh YouTube Vevo chỉ định để đăng tải video (ví dụ: TaylorSwiftVEVO)Nullable when status is draft'; COMMENT ON COLUMN "videos"."description" IS 'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTubeNullable when status is draft'; COMMENT ON COLUMN "videos"."keywords" IS 'Danh sach tu khoa video phan phoi len YouTube/VevoNullable when status is draft'; COMMENT ON COLUMN "videos"."is_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTubeNullable when status is draft'; COMMENT ON COLUMN "videos"."is_unlisted" IS 'Dang video o trang thai khong cong khai tren YouTube/VevoNullable when status is draft'; COMMENT ON COLUMN "videos"."visibility" IS 'Visibility của video: Default, Unlisted on YouTube, Unlisted on Vevo, Unlisted on YouTube/VevoNullable when status is draft'; COMMENT ON COLUMN "videos"."content_provider" IS 'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩmNullable when status is draft'; COMMENT ON COLUMN "videos"."copyright_owner" IS 'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)Nullable when status is draft'; COMMENT ON COLUMN "videos"."partner_custom_id_1" IS 'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thốngNullable when status is draft'; COMMENT ON COLUMN "videos"."partner_custom_id_2" IS 'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thốngNullable when status is draft'; COMMENT ON COLUMN "videos"."file_id" IS 'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thốngNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON TABLE "videos" IS 'Bảng lưu trữ thông tin metadata kỹ thuật và cấu hình phân phối của Video'`);
        await queryRunner.query(`CREATE TYPE "public"."release_execution3_run_pipeline_queue_status_enum" AS ENUM('NEW', 'PROCESSING', 'DONE', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "release_execution3_run_pipeline_queue" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "release_execution_id" uuid NOT NULL, "status" "public"."release_execution3_run_pipeline_queue_status_enum" NOT NULL DEFAULT 'NEW', "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '3', "error" character varying, "started_at" TIMESTAMP, "completed_at" TIMESTAMP, CONSTRAINT "PK_0dfed50321a6a560572439a4032" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ci_distribution_jobs3" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "type" character varying(30) NOT NULL, "upc" character varying, "note" character varying, "dsp_ci_codes" jsonb NOT NULL DEFAULT '[]', "release_execution_id" uuid NOT NULL, "step_id" uuid NOT NULL, "release_id" uuid, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "delivery_email" character varying, "delivery_email_subject" character varying, "sent_at" TIMESTAMP WITH TIME ZONE, "ci_tool_next_check_at" TIMESTAMP WITH TIME ZONE, "ci_tool_job_id" character varying, "step_label" character varying, CONSTRAINT "PK_2169fdcfa7372ee28ff9ae1d918" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "type" character varying(20) NOT NULL DEFAULT 'audio'`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."type" IS 'Video hay audio'`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" ADD "is_delivery_step" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "release_execution_id" uuid`);
        await queryRunner.query(`ALTER TABLE "logs" ADD "release_execution_step_id" uuid`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_next_check_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_job_id" character varying`);
        await queryRunner.query(`ALTER TABLE "releases" DROP CONSTRAINT "FK_44d483778e1900c779c41328142"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "album_format_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "release_captions" ADD CONSTRAINT "FK_c2791e6a9aab5c835979bc9098f" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_captions" ADD CONSTRAINT "FK_0b3f7f2e63b11d51f359fb83614" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "release_captions" ADD CONSTRAINT "FK_6effaa205e32fe0be1ae6e0cffc" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_c44e63bd171f37036dff4716b72" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_artist" ADD CONSTRAINT "FK_ea83525adf3fd916fac9fbd8ce4" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_946f90dc3cbe6b565c3377721f8" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_22102a4936eefef1aad771059f1" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_contributors" ADD CONSTRAINT "FK_76c7fd55d2de6c6a427118b5ad2" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_genres" ADD CONSTRAINT "FK_8653ec24ab6e06090c8802cd595" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video_genres" ADD CONSTRAINT "FK_6ac2627bc56786632542b01bd33" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_602c6c7411446bf7eb3cf25e825" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "releases" ADD CONSTRAINT "FK_44d483778e1900c779c41328142" FOREIGN KEY ("album_format_id") REFERENCES "album_formats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_e47934017b8c4a8d72f0103e6b6" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "logs" ADD CONSTRAINT "FK_be9bcacef710acf6ab6baa764e5" FOREIGN KEY ("release_execution_step_id") REFERENCES "release_execution_steps3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_cadd4c3c22fea15a7ec895d5796" FOREIGN KEY ("release_execution_id") REFERENCES "release_excutions3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_dc5219499b495fe78c391348039" FOREIGN KEY ("step_id") REFERENCES "release_execution_steps3"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" ADD CONSTRAINT "FK_ce6f9dd900ce79b3f762f4584f4" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_ce6f9dd900ce79b3f762f4584f4"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_dc5219499b495fe78c391348039"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs3" DROP CONSTRAINT "FK_cadd4c3c22fea15a7ec895d5796"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_be9bcacef710acf6ab6baa764e5"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP CONSTRAINT "FK_e47934017b8c4a8d72f0103e6b6"`);
        await queryRunner.query(`ALTER TABLE "releases" DROP CONSTRAINT "FK_44d483778e1900c779c41328142"`);
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8"`);
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_602c6c7411446bf7eb3cf25e825"`);
        await queryRunner.query(`ALTER TABLE "video_genres" DROP CONSTRAINT "FK_6ac2627bc56786632542b01bd33"`);
        await queryRunner.query(`ALTER TABLE "video_genres" DROP CONSTRAINT "FK_8653ec24ab6e06090c8802cd595"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_76c7fd55d2de6c6a427118b5ad2"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_22102a4936eefef1aad771059f1"`);
        await queryRunner.query(`ALTER TABLE "video_contributors" DROP CONSTRAINT "FK_946f90dc3cbe6b565c3377721f8"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_ea83525adf3fd916fac9fbd8ce4"`);
        await queryRunner.query(`ALTER TABLE "video_artist" DROP CONSTRAINT "FK_c44e63bd171f37036dff4716b72"`);
        await queryRunner.query(`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_6effaa205e32fe0be1ae6e0cffc"`);
        await queryRunner.query(`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_0b3f7f2e63b11d51f359fb83614"`);
        await queryRunner.query(`ALTER TABLE "release_captions" DROP CONSTRAINT "FK_c2791e6a9aab5c835979bc9098f"`);
        await queryRunner.query(`ALTER TABLE "releases" ALTER COLUMN "album_format_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "releases" ADD CONSTRAINT "FK_44d483778e1900c779c41328142" FOREIGN KEY ("album_format_id") REFERENCES "album_formats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_job_id"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_next_check_at"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "release_execution_step_id"`);
        await queryRunner.query(`ALTER TABLE "logs" DROP COLUMN "release_execution_id"`);
        await queryRunner.query(`ALTER TABLE "release_execution_steps3" DROP COLUMN "is_delivery_step"`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."type" IS 'Video hay audio'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TABLE "ci_distribution_jobs3"`);
        await queryRunner.query(`DROP TABLE "release_execution3_run_pipeline_queue"`);
        await queryRunner.query(`DROP TYPE "public"."release_execution3_run_pipeline_queue_status_enum"`);
        await queryRunner.query(`COMMENT ON TABLE "videos" IS NULL`);
        await queryRunner.query(`DROP TABLE "videos"`);
        await queryRunner.query(`COMMENT ON TABLE "video_genres" IS NULL`);
        await queryRunner.query(`DROP TABLE "video_genres"`);
        await queryRunner.query(`COMMENT ON TABLE "video_contributors" IS NULL`);
        await queryRunner.query(`DROP TABLE "video_contributors"`);
        await queryRunner.query(`COMMENT ON TABLE "video_artist" IS NULL`);
        await queryRunner.query(`DROP TABLE "video_artist"`);
        await queryRunner.query(`COMMENT ON TABLE "release_captions" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."UQ_release_captions_release_id_language_id_type"`);
        await queryRunner.query(`DROP TABLE "release_captions"`);
    }

}
