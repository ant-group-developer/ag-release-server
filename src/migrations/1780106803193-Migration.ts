import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780106803193 implements MigrationInterface {
    name = 'Migration1780106803193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "creator_id" uuid, "modifier_id" uuid, "release_id" uuid NOT NULL, "isrc" character varying(20) NOT NULL, "explicit" boolean NOT NULL DEFAULT false, "is_ai" boolean NOT NULL DEFAULT false, "channel" character varying(150) NOT NULL, "description" text, "is_kids" boolean NOT NULL DEFAULT false, "subtitles" jsonb, "content_provider" character varying(100), "copyright_owner" character varying(150), "partner_custom_id_1" character varying(100), "partner_custom_id_2" character varying(100), "file_id" uuid, CONSTRAINT "UQ_a555af19103f2e1243777c36c49" UNIQUE ("isrc"), CONSTRAINT "REL_602c6c7411446bf7eb3cf25e82" UNIQUE ("release_id"), CONSTRAINT "REL_9169ec60e4033dacf6cacec14c" UNIQUE ("file_id"), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id")); COMMENT ON COLUMN "videos"."release_id" IS 'Liên kết 1:1 sang thực thể Release sở hữu Video này'; COMMENT ON COLUMN "videos"."isrc" IS 'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi video'; COMMENT ON COLUMN "videos"."explicit" IS 'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổi'; COMMENT ON COLUMN "videos"."is_ai" IS 'Xác định video có sử dụng công nghệ hoặc nội dung do AI tạo ra hay không'; COMMENT ON COLUMN "videos"."channel" IS 'Tên kênh YouTube Vevo chỉ định để đăng tải video (ví dụ: TaylorSwiftVEVO)'; COMMENT ON COLUMN "videos"."description" IS 'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTube'; COMMENT ON COLUMN "videos"."is_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube'; COMMENT ON COLUMN "videos"."subtitles" IS 'Danh sách tệp phụ đề đính kèm cấu trúc: [{ language: "vi", fileId: "uuid", fileName: "abc.srt" }]'; COMMENT ON COLUMN "videos"."content_provider" IS 'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩm'; COMMENT ON COLUMN "videos"."copyright_owner" IS 'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)'; COMMENT ON COLUMN "videos"."partner_custom_id_1" IS 'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thống'; COMMENT ON COLUMN "videos"."partner_custom_id_2" IS 'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thống'; COMMENT ON COLUMN "videos"."file_id" IS 'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thống'`);
        await queryRunner.query(`COMMENT ON TABLE "videos" IS 'Bảng lưu trữ thông tin metadata kỹ thuật và cấu hình phân phối của Video'`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_job_id"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" DROP COLUMN "ci_tool_next_check_at"`);
        await queryRunner.query(`ALTER TABLE "releases" ADD "type" character varying(20) NOT NULL DEFAULT 'Audio'`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."type" IS 'Video hay audio'`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_602c6c7411446bf7eb3cf25e825" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8"`);
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_602c6c7411446bf7eb3cf25e825"`);
        await queryRunner.query(`COMMENT ON COLUMN "releases"."type" IS 'Video hay audio'`);
        await queryRunner.query(`ALTER TABLE "releases" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_next_check_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "ci_distribution_jobs" ADD "ci_tool_job_id" character varying`);
        await queryRunner.query(`COMMENT ON TABLE "videos" IS NULL`);
        await queryRunner.query(`DROP TABLE "videos"`);
    }

}
