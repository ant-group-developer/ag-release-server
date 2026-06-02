import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780362891572 implements MigrationInterface {
    name = 'Migration1780362891572'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8"`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "isrc" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."isrc" IS 'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi videoNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "explicit" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."explicit" IS 'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổiNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "ai_content" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."ai_content" IS 'Trang thai noi dung AI cua video theo VEVO: ALL, PARTLY, NONE, UNDETERMINEDNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "ai_content" SET DEFAULT 'UNDETERMINED'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "channel" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."channel" IS 'Tên kênh YouTube Vevo chỉ định để đăng tải video (ví dụ: TaylorSwiftVEVO)Nullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."description" IS 'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTubeNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."keywords" IS 'Danh sach tu khoa video phan phoi len YouTube/VevoNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "is_kids" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."is_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTubeNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "is_unlisted" DROP NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."is_unlisted" IS 'Dang video o trang thai khong cong khai tren YouTube/VevoNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."subtitles" IS 'Danh sách tệp phụ đề đính kèm cấu trúc: [{ language: "vi", fileId: "uuid", fileName: "abc.srt" }]Nullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."content_provider" IS 'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩmNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."copyright_owner" IS 'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)Nullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."partner_custom_id_1" IS 'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thốngNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."partner_custom_id_2" IS 'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thốngNullable when status is draft'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."file_id" IS 'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thốngNullable when status is draft'`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "videos" DROP CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8"`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."file_id" IS 'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thống'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."partner_custom_id_2" IS 'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thống'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."partner_custom_id_1" IS 'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thống'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."copyright_owner" IS 'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."content_provider" IS 'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩm'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."subtitles" IS 'Danh sách tệp phụ đề đính kèm cấu trúc: [{ language: "vi", fileId: "uuid", fileName: "abc.srt" }]'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."is_unlisted" IS 'Dang video o trang thai khong cong khai tren YouTube/Vevo'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "is_unlisted" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."is_kids" IS 'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "is_kids" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."keywords" IS 'Danh sach tu khoa video phan phoi len YouTube/Vevo'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."description" IS 'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTube'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."channel" IS 'Tên kênh YouTube Vevo chỉ định để đăng tải video (ví dụ: TaylorSwiftVEVO)'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "channel" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "ai_content" SET DEFAULT 'Undetermined'`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."ai_content" IS 'Trang thai noi dung AI cua video theo VEVO: All, Partly, None, Undetermined'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "ai_content" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."explicit" IS 'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổi'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "explicit" SET NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "videos"."isrc" IS 'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi video'`);
        await queryRunner.query(`ALTER TABLE "videos" ALTER COLUMN "isrc" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "videos" ADD CONSTRAINT "FK_9169ec60e4033dacf6cacec14c8" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
