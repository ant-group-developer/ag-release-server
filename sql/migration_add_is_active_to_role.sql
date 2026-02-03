ALTER TABLE "roles" ADD "is_active" boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN "roles"."is_active" IS 'Trạng thái hoạt động của vai trò';
