ALTER TABLE "permissions" ADD "is_active" boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN "permissions"."is_active" IS 'Trạng thái hoạt động của quyền hạn';
