import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1769660477709 implements MigrationInterface {
	name = 'Migration1769660477709';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "fk_track_artist_track"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "fk_track_artist_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "fk_track_artist_release_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "fk_track_artist_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" DROP CONSTRAINT "FK_price_tiers_currency"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "fk_track_contributors_track"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "fk_track_contributors_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "fk_track_contributors_release_contributor"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "fk_track_contributors_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "track_policy_action_id_fkey"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_d75145347d0d7237e7b3ada91e9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" DROP CONSTRAINT "fk_track_revenue_dsp"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" DROP CONSTRAINT "fk_track"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" DROP CONSTRAINT "fk_track_sensitive_modifier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" DROP CONSTRAINT "fk_track_sensitive_creator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "fk_tracks_track_sensitive"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "fk_tracks_release"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "fk_tracks_price_tier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "fk_release_artist_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "fk_release_artist_release"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "fk_release_artist_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "fk_release_contributors_release"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "fk_release_contributors_artist"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "fk_release_contributors_artist_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "fk_release_dsp_delivery_dsp"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "fk_release_dsp_delivery_release"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "fk_artists_genre"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "fk_artists_country"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "fk_dsp_routing_settings_specific_agg_config"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "fk_dsp_routing_settings_direct_config"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "fk_dsp_routing_settings_dsp"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" DROP CONSTRAINT "fk_tenant_dsp_tenant"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" DROP CONSTRAINT "fk_tenant_dsp_dsp"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "fk_issue_level"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "fk_tenant_issue_tenant"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "fk_tenant_issue_modifier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "fk_tenant_issue_issue"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "fk_tenant_issue_creator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "fk_tenant_tiers_modifier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "fk_tenant_tiers_creator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "fk_tenants_tenant_tier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "fk_user_role_user"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "fk_user_role_tenant"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "fk_user_role_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "fk_user_role_modifier"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "fk_user_role_creator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "fk_news_post"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP CONSTRAINT "fk_news_category"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "fk_dsp_routing_configs_sftp_config"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "fk_dsp_routing_configs_aggregator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" DROP CONSTRAINT "fk_sftp_configs_aggregator"`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" DROP CONSTRAINT "fk_distribution_ci_history_release"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."uniq_release_cover_original"`,
		);
		await queryRunner.query(`DROP INDEX "public"."idx_rdd_release_id"`);
		await queryRunner.query(`DROP INDEX "public"."idx_rdd_dsp_id"`);
		await queryRunner.query(`DROP INDEX "public"."idx_rdd_status"`);
		await queryRunner.query(
			`DROP INDEX "public"."idx_rdd_last_enqueued_at"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_rdd_last_delivered_at"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."ux_delivery_configs_name"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_dsp_routing_settings_direct_config_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_dsp_routing_settings_specific_agg_config_id"`,
		);
		await queryRunner.query(`DROP INDEX "public"."idx_user_role_role"`);
		await queryRunner.query(`DROP INDEX "public"."idx_user_role_tenant"`);
		await queryRunner.query(`DROP INDEX "public"."idx_user_role_user"`);
		await queryRunner.query(`DROP INDEX "public"."uq_i18n_key_locale"`);
		await queryRunner.query(`DROP INDEX "public"."ix_i18n_locale"`);
		await queryRunner.query(`DROP INDEX "public"."ix_i18n_key"`);
		await queryRunner.query(
			`DROP INDEX "public"."idx_dsp_routing_configs_aggregator_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_dsp_routing_configs_dsp_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_dsp_routing_configs_sftp_config_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."ux_dsp_routing_configs_dsp_id"`,
		);
		await queryRunner.query(`DROP INDEX "public"."ux_aggregators_code"`);
		await queryRunner.query(
			`DROP INDEX "public"."ux_sftp_configs_aggregator_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_sftp_configs_dsp_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_distribution_ci_history_release_created_at"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_distribution_ci_history_batch_id"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."idx_distribution_ci_history_upc"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "chk_dsp_routing_settings_mode_config"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "ck_tenant_issue_dates"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "UQ_462c73f56c560514608a0319011"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "UQ_track_contributors_unique"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" DROP CONSTRAINT "uq_dsp_action"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "UQ_318c2a24200bde54aa82f90199d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "uq_release_contributors"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "uq_release_dsp_delivery"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" DROP CONSTRAINT "uq_tenant_dsp"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "uq_user_role"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "uq_news_post_lang"`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_localize" IS 'Bảng lưu thông tin bản địa hóa (localize) tiêu đề track theo ngôn ngữ'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_contributors" IS 'Bảng liên kết contributor (nghệ sĩ + vai trò) tham gia từng track'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_origin_types" IS 'Danh mục nguồn gốc của track (original, cover, remix, AI, v.v.)'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_revenue" IS 'Bảng lưu doanh thu của track theo từng DSP, quốc gia và ngày báo cáo'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_sensitives" IS 'Danh mục mức độ nhạy cảm nội dung của track (explicit, clean, v.v.)'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_types" IS 'Danh mục loại track (original, instrumental, remix, v.v.)'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "release_contributors" IS 'Bảng liên kết contributor (nghệ sĩ tham gia) với release theo vai trò'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "release_dsp_delivery" IS 'Bảng liên kết release với các DSP được phân phối'`,
		);
		await queryRunner.query(`COMMENT ON TABLE "tenant_user" IS NULL`);
		await queryRunner.query(`COMMENT ON TABLE "users" IS NULL`);
		await queryRunner.query(
			`COMMENT ON TABLE "user_role" IS 'Bảng gán role cho user theo từng tenant (RBAC đa tenant)'`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."dsp_release_status_status_enum" AS ENUM('draft', 'processing', 'issues', 'never_distributed', 'distributed', 'taken_down')`,
		);
		await queryRunner.query(
			`CREATE TABLE "dsp_release_status" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dsp_id" character varying NOT NULL, "release_id" character varying NOT NULL, "status" "public"."dsp_release_status_status_enum" NOT NULL DEFAULT 'draft', CONSTRAINT "PK_82477ab030c8f549e8c53d3ad69" PRIMARY KEY ("id"))`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_48cce8c8e9830e5a732b3ad39a" ON "dsp_release_status" ("dsp_id", "release_id") `,
		);
		await queryRunner.query(
			`CREATE TABLE "system_settings" ("key" character varying(100) NOT NULL, "value" text, "description" text, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b1b5bc664526d375c94ce9ad43d" PRIMARY KEY ("key"))`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP COLUMN "artist_role_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP COLUMN "is_sensitive_content"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP COLUMN "artist_role_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "artists_code1_key"`,
		);
		await queryRunner.query(`ALTER TABLE "artists" DROP COLUMN "code1"`);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "logins_count"`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" DROP COLUMN "name;code;note"`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" DROP COLUMN "name;code;note"`,
		);
		await queryRunner.query(`ALTER TABLE "i18n" DROP COLUMN "i18n_key"`);
		await queryRunner.query(`ALTER TABLE "i18n" DROP COLUMN "i18n_value"`);
		await queryRunner.query(
			`ALTER TABLE "app_config" DROP COLUMN "telegram"`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" DROP COLUMN "acr_cloud"`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" DROP COLUMN "dspusagecount"`,
		);
		await queryRunner.query(`ALTER TABLE "i18n" ADD "key" text NOT NULL`);
		await queryRunner.query(`ALTER TABLE "i18n" ADD "value" text NOT NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "files"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "files" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "files" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "files"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "files"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "audio_files"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."bitrate" IS 'Bitrate (Mbps) Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."bit_depth" IS 'Độ sâu bit (bit depth) Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."sample_length" IS 'Số mẫu âm thanh Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."preview" IS 'Thời lượng preview, tính bằng giây Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."artist_id" IS 'ID nghệ sĩ tham gia track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."release_artist_id" IS 'ID release_artist dùng để đồng bộ nghệ sĩ từ release xuống track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."is_from_release_action" IS 'Được tạo tự động từ thao tác đồng bộ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."is_from_track_action" IS 'Được tạo từ thao tác chỉnh sửa trực tiếp trên track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."metadata_language_country_id" IS 'Quốc gia dùng cho metadata ngôn ngữ Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."audio_language_id" IS 'Ngôn ngữ audio của track Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."metadata_language_id" IS 'Ngôn ngữ metadata của track Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."recording_country_id" IS 'Quốc gia thu âm của track Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."language_id" IS 'ID ngôn ngữ áp dụng cho bản localize'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."track_id" IS 'ID track được bản địa hóa'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."version" IS 'Phiên bản track theo ngôn ngữ (nếu có)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "currencies"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "price_tiers"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."artist_id" IS 'ID nghệ sĩ tham gia track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."artist_role_id" IS 'ID vai trò của nghệ sĩ trong track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."release_contributor_id" IS 'ID release_contributor để đồng bộ contributor từ release xuống track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."is_from_release_action" IS 'Được tạo tự động từ thao tác đồng bộ contributor từ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."is_from_track_action" IS 'Được tạo từ thao tác chỉnh sửa contributor trực tiếp trên track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_origin_types"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_origin_types"."is_default" IS 'Đánh dấu loại nguồn gốc mặc định'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "dsp_action"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsp_action"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsp_action"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "actions"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`ALTER TABLE "actions" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "actions" ADD "note" character varying(500)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."note" IS 'Mô tả hoặc ghi chú cho hành động'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_38cd5eb62ea942104ee8fb42958"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."action_id" IS 'ID hành động áp dụng (có thể NULL nếu dùng mặc định)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."dsp_id" IS 'ID DSP áp dụng chính sách'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(`DROP SEQUENCE "track_revenue_id_seq"`);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."report_date" IS 'Ngày phát sinh doanh thu (report date)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."dsp_id" IS 'ID DSP nguồn doanh thu'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."country_code" IS 'Mã quốc gia (ISO-2) phát sinh doanh thu'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."currency_code" IS 'Mã tiền tệ (ISO-4217)'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ALTER COLUMN "amount" TYPE numeric(30,21)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."configuration" IS 'Cấu hình phân phối / loại giao dịch từ DSP'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."track_id" IS 'ID track phát sinh doanh thu'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."name" IS 'Tên mức độ nhạy cảm của track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."icon" IS 'Icon đại diện cho mức độ nhạy cảm'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "track_types"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_types"."is_default" IS 'Đánh dấu loại track mặc định'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17"`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "tracks"."id" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."version" IS 'Phiên bản track (ví dụ: Extended Version, Remix)'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "uq_tracks_isrc"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."p_line_year" IS 'Năm P-Line Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."p_line_owner" IS 'Chủ sở hữu P-Line Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."primary_genre_id" IS 'Thể loại chính Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."track_type_id" IS 'Loại track Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."track_origin_type_id" IS 'Nguồn gốc track Nullable when status is draft'`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."scan_copyright_status_enum" RENAME TO "scan_copyright_status_enum_old"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."tracks_scan_copyright_status_enum" AS ENUM('un_scanned', 'warning', 'finished', 'rejected')`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" TYPE "public"."tracks_scan_copyright_status_enum" USING "scan_copyright_status"::"text"::"public"."tracks_scan_copyright_status_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" SET DEFAULT 'un_scanned'`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."scan_copyright_status_enum_old"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."price_tier_id" IS 'Price tier áp dụng cho track Nullable when status is draft'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "genres"."id" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "labels"."id" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ADD CONSTRAINT "UQ_430ce333ab69091340a9cf00707" UNIQUE ("code")`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."id" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."release_dsp_status" RENAME TO "release_dsp_status_old"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."release_dsp_delivery_status_enum" AS ENUM('draft', 'processing', 'issues', 'never_distributed', 'distributed', 'taken_down')`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" TYPE "public"."release_dsp_delivery_status_enum" USING "status"::"text"::"public"."release_dsp_delivery_status_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" SET DEFAULT 'draft'`,
		);
		await queryRunner.query(`DROP TYPE "public"."release_dsp_status_old"`);
		await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."status" IS '
			Trạng thái phân phối release lên DSP:
			- draft: chưa phát hành
			- processing: đang xử lý phân phối
			- issues: có lỗi khi phân phối
			- never_distributed: chưa từng phân phối lần nào
			- distributed: đã phân phối thành công
			- taken_down: đã gỡ xuống khỏi DSP
		'`);
		await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."last_enqueued_at" IS '
			Thời điểm gần nhất release được đưa vào hàng đợi (queue) để phân phối lên DSP.
			Không đảm bảo là đã gửi thành công.
		'`);
		await queryRunner.query(`COMMENT ON COLUMN "release_dsp_delivery"."last_delivered_at" IS '
			Thời điểm gần nhất release được phân phối thành công lên DSP.
			Chỉ cập nhật khi DSP trả về kết quả thành công.
		'`);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."distribute_worldwide" IS 'Phân phối toàn cầu Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."distribution_type" IS 'Loại phân phối theo lãnh thổ Nullable when status is draft'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "timezones"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "timezones" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "timezones" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "timezones"."utc" IS 'Độ lệch UTC (ví dụ: +07:00)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "timezones"."zone" IS 'Tên zone chuẩn (ví dụ: Asia/Ho_Chi_Minh)'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "releases"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."primary_genre_id" IS 'Thể loại chính Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."label_id" IS 'Label phát hành Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."title" IS 'Tiêu đề release Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."c_line_year" IS 'Năm C-Line (bản quyền ghi âm) Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."c_line_owner" IS 'Chủ sở hữu C-Line Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."p_line_year" IS 'Năm P-Line (bản quyền sản xuất) Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."p_line_owner" IS 'Chủ sở hữu P-Line Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."is_various_artist" IS 'Đánh dấu release nhiều nghệ sĩ (Various Artists)'`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."release_time_mode" RENAME TO "release_time_mode_old"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."releases_release_time_mode_enum" AS ENUM('global_midnight', 'specific_timezone')`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" TYPE "public"."releases_release_time_mode_enum" USING "release_time_mode"::"text"::"public"."releases_release_time_mode_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" SET DEFAULT 'global_midnight'`,
		);
		await queryRunner.query(`DROP TYPE "public"."release_time_mode_old"`);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."release_date" IS 'Ngày phát hành Nullable when status is draft'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "tenant_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."version" IS 'Phiên bản release theo ngôn ngữ (nếu có)'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "languages"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "languages" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "languages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "languages"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "languages"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."metadata_language_country_id" IS 'Quốc gia dùng cho metadata ngôn ngữ Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."audio_language_id" IS 'Ngôn ngữ audio của release Nullable when status is draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."metadata_language_id" IS 'Ngôn ngữ metadata của release Nullable when status is draft'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "countries"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "countries" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "countries" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "countries"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "countries"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "artists"."id" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."artist_source_enum" RENAME TO "artist_source_enum_old"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."artists_artist_source_enum" AS ENUM('music_brainz', 'ant_music', 'ada')`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" TYPE "public"."artists_artist_source_enum" USING "artist_source"::"text"::"public"."artists_artist_source_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" SET DEFAULT 'ant_music'`,
		);
		await queryRunner.query(`DROP TYPE "public"."artist_source_enum_old"`);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "is_scanned" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "delivery_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "delivery_configs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP COLUMN "mode"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."dsp_routing_settings_mode_enum" AS ENUM('SYSTEM', 'AGGREGATOR', 'DIRECT')`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD "mode" "public"."dsp_routing_settings_mode_enum" NOT NULL DEFAULT 'AGGREGATOR'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "dsps"."id" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "ddex_id"`);
		await queryRunner.query(
			`ALTER TABLE "dsps" ADD "ddex_id" character varying(200)`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "dsps"."ddex_name" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "tenant_dsp"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_dsp"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_dsp"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "issue_level"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ADD CONSTRAINT "UQ_dec0d644fd893e07338a00f650a" UNIQUE ("name_vi")`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ADD CONSTRAINT "UQ_6720ecdc6b769195e27376ff4b8" UNIQUE ("name_en")`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."severity_rank" IS 'Thứ hạng mức độ nghiêm trọng (1 = thấp nhất)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."weight" IS 'Hệ số nhân điểm cho issue thuộc cấp độ này'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "issues"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "UQ_03abb6b2759dd9dfaf8231cdda4" UNIQUE ("name_vi")`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "UQ_6305c7187da0b29acd037499122" UNIQUE ("name_en")`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."score" IS 'Điểm cơ bản của issue (có thể bị override theo tenant)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."issue_level_id" IS 'ID cấp độ issue (issue level)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."score" IS 'Điểm override cho issue; nếu = 0 thì dùng issue.score mặc định'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."start_date_affect" IS 'Thời điểm bắt đầu ảnh hưởng đến điểm'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."end_date_affect" IS 'Thời điểm kết thúc ảnh hưởng; NULL = đang áp dụng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."description" IS 'Mô tả chi tiết issue cho tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP COLUMN "created_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP COLUMN "updated_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "UQ_1361216552af8fabd84ca755e8e" UNIQUE ("name_vi")`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "UQ_7b3719fe941c20f3b26cc287bb0" UNIQUE ("name_en")`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "UQ_6130d69062f52786a4e2951291d" UNIQUE ("code")`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."min_score" IS 'Điểm tối thiểu để đạt tier này'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."max_score" IS 'Điểm tối đa của tier này'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "color" DROP DEFAULT`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "tenants"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."primary_color" IS 'Màu chủ đạo của tenant (ví dụ: #4540BF)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."tenant_tier_id" IS 'ID gói dịch vụ (tenant tier) đang áp dụng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."owner_id" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."parent_id" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "tenant_user"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."type" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."tenant_id" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."user_id" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "users"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "users"."name" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "users"."email" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."telegram_id" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "users"."avatar" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "users"."type" IS NULL`);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."is_active" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."email_verified" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."last_login" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."last_active" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "users"."last_ip" IS NULL`);
		await queryRunner.query(`COMMENT ON COLUMN "permissions"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "permissions" ADD "note" character varying(500)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."note" IS 'Mô tả hoặc ghi chú cho quyền hạn'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "roles"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "code" SET NOT NULL`,
		);
		await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "roles" ADD "note" character varying(500)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."note" IS 'Ghi chú hoặc mô tả thêm cho vai trò'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "user_role"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."user_id" IS 'ID người dùng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."role_id" IS 'ID vai trò được gán'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."tenant_id" IS 'ID tenant mà role này có hiệu lực'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "news_posts"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "creator_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "modifier_id" SET NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP COLUMN "thumbnail"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD "thumbnail" character varying(200)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."thumbnail" IS 'Ảnh thumbnail của bài viết'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP COLUMN "status"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."news_posts_status_enum" AS ENUM('public', 'private')`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD "status" "public"."news_posts_status_enum" NOT NULL DEFAULT 'private'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."status" IS 'Trạng thái bài viết (private / public / draft...)'`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "backups"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "backups" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "backups" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "backups"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "backups"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."creator_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."modifier_id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."id" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."updated_at" IS NULL`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "app_config"."id" IS NULL`);
		await queryRunner.query(
			`ALTER TABLE "app_config" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "app_config"."created_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "app_config"."updated_at" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "UQ_0fb50fcb3d9e592111076ac413d" UNIQUE ("dsp_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "UQ_3f1bd64741fa999af4bda1e5498" UNIQUE ("sftp_config_id")`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."routing_mode_enum" RENAME TO "routing_mode_enum_old"`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."dsp_routing_configs_mode_enum" AS ENUM('direct', 'aggregator', 'system')`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "mode" TYPE "public"."dsp_routing_configs_mode_enum" USING "mode"::"text"::"public"."dsp_routing_configs_mode_enum"`,
		);
		await queryRunner.query(`DROP TYPE "public"."routing_mode_enum_old"`);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "is_active" SET NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "is_default" SET NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" DROP COLUMN "ddex_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ADD "ddex_id" character varying(200)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "aggregators"."ddex_name" IS NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "creator_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "modifier_id" SET DEFAULT '3adcd1d1-fcaf-4495-9e54-0a8bd0ad09f2'`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ADD CONSTRAINT "UQ_ba1bbac7f0863173f40863e272c" UNIQUE ("aggregator_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_a132ab33e1fe4d45c71b6a7565" ON "delivery_configs" ("name") `,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_90c53c368c305aca2db967e385" ON "i18n" ("key") `,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_76f1e5bdc59b92b8f35f0aa088" ON "i18n" ("locale") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_77536dbdf2b176b8b3a3fda80f" ON "i18n" ("key", "locale") `,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_ffa952eeba5891d7cade013b2a" ON "distribution_ci_history" ("upc") `,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_0066d0f76c559975436f6959ca" ON "distribution_ci_history" ("batch_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_5b1383a0a5833c8ce57ac9e902" ON "distribution_ci_history" ("release_id", "created_at") `,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "UQ_0abb2c9a9bb102f2c15a2ce4b7b" UNIQUE ("artist_id", "track_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "UQ_d61a7b41ce460cd75b4a447b7fe" UNIQUE ("artist_id", "artist_role_id", "track_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ADD CONSTRAINT "UQ_2a3b2e826050270b3c8f16d744f" UNIQUE ("dsp_id", "action_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "UQ_ef9b6e6695967a6bec70cfa82e5" UNIQUE ("track_id", "action_id", "dsp_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "UQ_f6d30be760546ea0ff914492481" UNIQUE ("artist_id", "release_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "UQ_2dd329fd2d58f76a91adf74c319" UNIQUE ("artist_id", "artist_role_id", "release_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "UQ_4506ac004b42bda1c05c9f50d4b" UNIQUE ("news_post_id", "language_code")`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ADD CONSTRAINT "FK_706c0604b9eb1cb34a129eedd4c" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ADD CONSTRAINT "FK_4d256e74fdf7dfc7fe3db8646d4" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ADD CONSTRAINT "FK_65545b07c020cbdbbb7681608c2" FOREIGN KEY ("peak_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "FK_bad2f837ce966cd4d0a7a4869da" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "FK_44b3054dbccf94b5385e7c16a5d" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ADD CONSTRAINT "FK_80c457bc2a7f83aa7a38f07abcc" FOREIGN KEY ("metadata_language_country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ADD CONSTRAINT "FK_5139ae6a60c799552ba18c91c68" FOREIGN KEY ("recording_country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ADD CONSTRAINT "FK_7ca6e761a24b38013ad38713aa5" FOREIGN KEY ("audio_language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ADD CONSTRAINT "FK_925cc591b88a93fc66156432dec" FOREIGN KEY ("metadata_language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ADD CONSTRAINT "FK_b2bef2256cfcf7a3e5eaeb20716" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ADD CONSTRAINT "FK_2a1ac178b973083122b1d4d2f39" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ADD CONSTRAINT "FK_448cfaab5f56b0f67cc66b2403c" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" ADD CONSTRAINT "FK_f5704c32d99232983a361d94a90" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ADD CONSTRAINT "FK_17a45017ebe3e6d8927e89067b8" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ADD CONSTRAINT "FK_5bf30c50d712bae277ca356acea" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ADD CONSTRAINT "FK_ab41a604cb75dce9558c50fc4e1" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "FK_97b106f98cb47ae955d8866cb7f" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "FK_49c6beb4906102777590b508e5b" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "FK_d5d963070db3c19968c193f778d" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ADD CONSTRAINT "FK_3605a7ccb2c31283c2f438d42d6" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ADD CONSTRAINT "FK_6d28e46182ca0b0777da9bbeca6" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ADD CONSTRAINT "FK_c144f2feaab17622e5a5f2b6ee5" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ADD CONSTRAINT "FK_c786fff755e8aea94c0ee73f3e6" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_d75145347d0d7237e7b3ada91e9" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_38cd5eb62ea942104ee8fb42958" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ADD CONSTRAINT "FK_0f8cbe404806a3e0a772936bf80" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ADD CONSTRAINT "FK_e4403b788d392ac6a75c89f447b" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ADD CONSTRAINT "FK_e55f9cec9169401256cd9f07b60" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ADD CONSTRAINT "FK_5cca1e3fa45143c89b30314d89a" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_233b4896b79bc3a09fe2e7cd33e" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_56b47f4b4a1fa8dc2c4aed50e94" FOREIGN KEY ("primary_genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_1647df2df382582079983115dfe" FOREIGN KEY ("sub_genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_22d6e3e276290bd8aba903d0e28" FOREIGN KEY ("track_type_id") REFERENCES "track_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_bfba46e5d7c2ebed72f137ece6f" FOREIGN KEY ("track_origin_type_id") REFERENCES "track_origin_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_0693a1a86145ed3e897ebe2f407" FOREIGN KEY ("price_tier_id") REFERENCES "price_tiers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "FK_45af201b468843adc0043376602" FOREIGN KEY ("track_sensitive_id") REFERENCES "track_sensitives"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ADD CONSTRAINT "FK_d13bb8a685f86748ee57299f7ef" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ADD CONSTRAINT "FK_861431344e4be139790d9e4aac4" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ADD CONSTRAINT "FK_9534d65dd5c6bf747bf5ce7d0aa" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ADD CONSTRAINT "FK_1a821992044479ed14974c1aaca" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ADD CONSTRAINT "FK_f569348fea9ac58ad1013e763a3" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "FK_324a35ede6ac9033255057357ef" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "FK_1d817cf036975de7f3bbfecae31" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ADD CONSTRAINT "FK_fa651daf7ef8e110e11a36df797" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ADD CONSTRAINT "FK_685eabfd94dcce03a30345f458e" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_940118fedf7e33e44e2e9bef462" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_2dfa99602df7a4afba91716dd8b" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ADD CONSTRAINT "FK_67b825654a61e772db54cd3ae30" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ADD CONSTRAINT "FK_3a6a2583bb9d384c77d45aab213" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "FK_8dfd4331cc9384f980e9a721d30" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" ADD CONSTRAINT "FK_513f1ce32ea2c51d0630869efbd" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_44d483778e1900c779c41328142" FOREIGN KEY ("album_format_id") REFERENCES "album_formats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_c106b24c260572772e1dbbc21e8" FOREIGN KEY ("primary_genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_d530ef1be645c481414857a6706" FOREIGN KEY ("sub_genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_330140f54009f5fcf785c58f44e" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_411fef0afd9eba8e63d05dbb20a" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_5508f9fce2612d730d956fb8f19" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_ff54e283e446c9cc70110512028" FOREIGN KEY ("release_timezone_id") REFERENCES "timezones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ADD CONSTRAINT "FK_98f690758f195a09664c15bae27" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ADD CONSTRAINT "FK_ee18fb83969889a91ce89fa1ae1" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ADD CONSTRAINT "FK_a21be0af831df856191968f2aec" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ADD CONSTRAINT "FK_460ef864795eb1672e48089c354" FOREIGN KEY ("metadata_language_country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ADD CONSTRAINT "FK_f1c716d09fb61384da50e0b33fe" FOREIGN KEY ("audio_language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ADD CONSTRAINT "FK_200409e6c7f867e159e2fb55bac" FOREIGN KEY ("metadata_language_id") REFERENCES "languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ADD CONSTRAINT "FK_90744b146ead957272664ad340a" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "FK_e4a5a92f3004f5420a95501ce26" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "FK_c14b165d66f89b256290ca482c6" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "FK_90995dbc5b5788bfb1b504647d8" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "FK_84fc2bd2d4fc89e5a8585be1818" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_fc3dc4f6867d2f95e3d23ba5477" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_e378c55296b8e6f89d4b5dd721c" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ADD CONSTRAINT "FK_cddc892e6fbf2786ba7273ee716" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_release_status" ADD CONSTRAINT "FK_1d92d17d0d046106603141c4ae8" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_0fcbe8564f1279962242a5b51fb" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_c4725f00b83e27ec72727f95e65" FOREIGN KEY ("direct_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "FK_c5503ee2087c9811a96bf740631" FOREIGN KEY ("specific_aggregator_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ADD CONSTRAINT "FK_7788db4a1a36cc35260f185b20c" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ADD CONSTRAINT "FK_047b7db2840104d32fdf49c14d9" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ADD CONSTRAINT "FK_e2149ac95ec31939e6c91c372ae" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ADD CONSTRAINT "FK_fc14ecc0354329d0dabef1d337d" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ADD CONSTRAINT "FK_6a47d535420458cb4e3e9cace59" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ADD CONSTRAINT "FK_458cd1b2ec17842bb6ab78872bb" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "FK_b4634db530af2d532e8c028f94e" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "FK_08a38106bfe4de059e116ef5158" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "FK_18828d31d8180ad73610dd9de9a" FOREIGN KEY ("issue_level_id") REFERENCES "issue_level"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "FK_c8ebf2b66840fd0091619b8b7c6" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "FK_007676689ebd5d5eca653c05d13" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "FK_3ba5b99092625b7108b691b9bd1" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "FK_3ccfc197769ff601f52ea2d81a7" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "FK_df81a19c7525b652c7badd3764c" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "FK_e3bd0ca12141fc4d164cd43e1a6" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "FK_d7e987969e72adacb877570995d" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "FK_1b229bcb849cee7d07a3d127683" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "FK_efba90c155ec02ae586fb7ed31d" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "FK_bb2a90ed37750405dd793f3d7ff" FOREIGN KEY ("parent_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "FK_43d8e67e7e017c92f243e92f21e" FOREIGN KEY ("tenant_tier_id") REFERENCES "tenant_tiers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ADD CONSTRAINT "FK_3fcaa9dbb974f9b1fdccc196926" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ADD CONSTRAINT "FK_1ed4230ec7b7ca4041402df9b59" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ADD CONSTRAINT "FK_81bce9f2446bc68e5e2efd423a2" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ADD CONSTRAINT "FK_f06a5757cf435fd81c0730e5778" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD CONSTRAINT "FK_eebaffddb3c6e049fa709e7de02" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD CONSTRAINT "FK_4fa3646aeebcfb0cd9419dcec9d" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ADD CONSTRAINT "FK_ef7f7e021a4d2c1ed99b191e849" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ADD CONSTRAINT "FK_0df30683d0f67875fb6a610a01e" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ADD CONSTRAINT "FK_3d0a7155eafd75ddba5a7013368" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ADD CONSTRAINT "FK_e3a3ba47b7ca00fd23be4ebd6cf" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "FK_d0e5815877f7395a198a4cb0a46" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "FK_32a6fc2fcb019d8e3a8ace0f55f" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "FK_45a949df1819b8e0040aace0ed1" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "FK_6882fa38fefa198de81b286342f" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "FK_ca8de6216665737e9ed07b7dd1b" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "FK_2848b2477636440af4de2858045" FOREIGN KEY ("news_post_id") REFERENCES "news_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "FK_6281cf898536dd00145bd32c46e" FOREIGN KEY ("language_code") REFERENCES "languages"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "FK_7528099678299bda1214e4581d7" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "FK_0fae20a96808b8847db8d46935b" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD CONSTRAINT "FK_e09fc99c2c4f0a1e6f5bbdfd0a8" FOREIGN KEY ("news_category_id") REFERENCES "news_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD CONSTRAINT "FK_6c8759b16bcfb042ae2a733a31d" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD CONSTRAINT "FK_fe147445c9183558f0ae9d94e4a" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ADD CONSTRAINT "FK_85dae0cff6123b7f2a6438f60d4" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ADD CONSTRAINT "FK_c3858ff058f009666f469464fc9" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "FK_04ccdbab2a9b025e4eab834b2c9" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "FK_3f1bd64741fa999af4bda1e5498" FOREIGN KEY ("sftp_config_id") REFERENCES "sftp_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ADD CONSTRAINT "FK_ba1bbac7f0863173f40863e272c" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ADD CONSTRAINT "FK_c921bcd2b55a7bd206a8b4845df" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants_closure" ADD CONSTRAINT "FK_62d261b9ed07a51e7fa59c472a9" FOREIGN KEY ("id_ancestor") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants_closure" ADD CONSTRAINT "FK_56255bf923a734bf9d9dff70430" FOREIGN KEY ("id_descendant") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "tenants_closure" DROP CONSTRAINT "FK_56255bf923a734bf9d9dff70430"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants_closure" DROP CONSTRAINT "FK_62d261b9ed07a51e7fa59c472a9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" DROP CONSTRAINT "FK_c921bcd2b55a7bd206a8b4845df"`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" DROP CONSTRAINT "FK_ba1bbac7f0863173f40863e272c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "FK_3f1bd64741fa999af4bda1e5498"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "FK_04ccdbab2a9b025e4eab834b2c9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" DROP CONSTRAINT "FK_c3858ff058f009666f469464fc9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" DROP CONSTRAINT "FK_85dae0cff6123b7f2a6438f60d4"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP CONSTRAINT "FK_fe147445c9183558f0ae9d94e4a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP CONSTRAINT "FK_6c8759b16bcfb042ae2a733a31d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP CONSTRAINT "FK_e09fc99c2c4f0a1e6f5bbdfd0a8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "FK_0fae20a96808b8847db8d46935b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "FK_7528099678299bda1214e4581d7"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "FK_6281cf898536dd00145bd32c46e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "FK_2848b2477636440af4de2858045"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "FK_ca8de6216665737e9ed07b7dd1b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "FK_6882fa38fefa198de81b286342f"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "FK_45a949df1819b8e0040aace0ed1"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "FK_32a6fc2fcb019d8e3a8ace0f55f"`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" DROP CONSTRAINT "FK_d0e5815877f7395a198a4cb0a46"`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" DROP CONSTRAINT "FK_e3a3ba47b7ca00fd23be4ebd6cf"`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" DROP CONSTRAINT "FK_3d0a7155eafd75ddba5a7013368"`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" DROP CONSTRAINT "FK_0df30683d0f67875fb6a610a01e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" DROP CONSTRAINT "FK_ef7f7e021a4d2c1ed99b191e849"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP CONSTRAINT "FK_4fa3646aeebcfb0cd9419dcec9d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP CONSTRAINT "FK_eebaffddb3c6e049fa709e7de02"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" DROP CONSTRAINT "FK_f06a5757cf435fd81c0730e5778"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" DROP CONSTRAINT "FK_81bce9f2446bc68e5e2efd423a2"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" DROP CONSTRAINT "FK_1ed4230ec7b7ca4041402df9b59"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" DROP CONSTRAINT "FK_3fcaa9dbb974f9b1fdccc196926"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "FK_43d8e67e7e017c92f243e92f21e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "FK_bb2a90ed37750405dd793f3d7ff"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "FK_efba90c155ec02ae586fb7ed31d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "FK_1b229bcb849cee7d07a3d127683"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" DROP CONSTRAINT "FK_d7e987969e72adacb877570995d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "FK_e3bd0ca12141fc4d164cd43e1a6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "FK_df81a19c7525b652c7badd3764c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "FK_3ccfc197769ff601f52ea2d81a7"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "FK_3ba5b99092625b7108b691b9bd1"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "FK_007676689ebd5d5eca653c05d13"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" DROP CONSTRAINT "FK_c8ebf2b66840fd0091619b8b7c6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "FK_18828d31d8180ad73610dd9de9a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "FK_08a38106bfe4de059e116ef5158"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "FK_b4634db530af2d532e8c028f94e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" DROP CONSTRAINT "FK_458cd1b2ec17842bb6ab78872bb"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" DROP CONSTRAINT "FK_6a47d535420458cb4e3e9cace59"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" DROP CONSTRAINT "FK_fc14ecc0354329d0dabef1d337d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" DROP CONSTRAINT "FK_e2149ac95ec31939e6c91c372ae"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" DROP CONSTRAINT "FK_047b7db2840104d32fdf49c14d9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" DROP CONSTRAINT "FK_7788db4a1a36cc35260f185b20c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_c5503ee2087c9811a96bf740631"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_c4725f00b83e27ec72727f95e65"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP CONSTRAINT "FK_0fcbe8564f1279962242a5b51fb"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_release_status" DROP CONSTRAINT "FK_1d92d17d0d046106603141c4ae8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_cddc892e6fbf2786ba7273ee716"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_e378c55296b8e6f89d4b5dd721c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_5f1c816c6cf414c5df09e62a125"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" DROP CONSTRAINT "FK_fc3dc4f6867d2f95e3d23ba5477"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "FK_84fc2bd2d4fc89e5a8585be1818"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "FK_90995dbc5b5788bfb1b504647d8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "FK_c14b165d66f89b256290ca482c6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" DROP CONSTRAINT "FK_e4a5a92f3004f5420a95501ce26"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" DROP CONSTRAINT "FK_90744b146ead957272664ad340a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" DROP CONSTRAINT "FK_200409e6c7f867e159e2fb55bac"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" DROP CONSTRAINT "FK_f1c716d09fb61384da50e0b33fe"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" DROP CONSTRAINT "FK_460ef864795eb1672e48089c354"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" DROP CONSTRAINT "FK_a21be0af831df856191968f2aec"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" DROP CONSTRAINT "FK_ee18fb83969889a91ce89fa1ae1"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_98f690758f195a09664c15bae27"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_ff54e283e446c9cc70110512028"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_5508f9fce2612d730d956fb8f19"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_411fef0afd9eba8e63d05dbb20a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_330140f54009f5fcf785c58f44e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_d530ef1be645c481414857a6706"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_c106b24c260572772e1dbbc21e8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" DROP CONSTRAINT "FK_44d483778e1900c779c41328142"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" DROP CONSTRAINT "FK_513f1ce32ea2c51d0630869efbd"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "FK_8dfd4331cc9384f980e9a721d30"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" DROP CONSTRAINT "FK_d5113bb1940e63d7cdeb9bae61b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" DROP CONSTRAINT "FK_3a6a2583bb9d384c77d45aab213"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" DROP CONSTRAINT "FK_67b825654a61e772db54cd3ae30"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_f70e699e006d0dfa5b4c92562b1"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_2dfa99602df7a4afba91716dd8b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "FK_940118fedf7e33e44e2e9bef462"`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" DROP CONSTRAINT "FK_685eabfd94dcce03a30345f458e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" DROP CONSTRAINT "FK_fa651daf7ef8e110e11a36df797"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "FK_1d817cf036975de7f3bbfecae31"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "FK_324a35ede6ac9033255057357ef"`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" DROP CONSTRAINT "FK_f569348fea9ac58ad1013e763a3"`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" DROP CONSTRAINT "FK_1a821992044479ed14974c1aaca"`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" DROP CONSTRAINT "FK_9534d65dd5c6bf747bf5ce7d0aa"`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" DROP CONSTRAINT "FK_861431344e4be139790d9e4aac4"`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" DROP CONSTRAINT "FK_d13bb8a685f86748ee57299f7ef"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_45af201b468843adc0043376602"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_0693a1a86145ed3e897ebe2f407"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_bfba46e5d7c2ebed72f137ece6f"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_22d6e3e276290bd8aba903d0e28"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_1647df2df382582079983115dfe"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_56b47f4b4a1fa8dc2c4aed50e94"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" DROP CONSTRAINT "FK_233b4896b79bc3a09fe2e7cd33e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" DROP CONSTRAINT "FK_5cca1e3fa45143c89b30314d89a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" DROP CONSTRAINT "FK_e55f9cec9169401256cd9f07b60"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" DROP CONSTRAINT "FK_e4403b788d392ac6a75c89f447b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" DROP CONSTRAINT "FK_0f8cbe404806a3e0a772936bf80"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_38cd5eb62ea942104ee8fb42958"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_d75145347d0d7237e7b3ada91e9"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17"`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" DROP CONSTRAINT "FK_c786fff755e8aea94c0ee73f3e6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" DROP CONSTRAINT "FK_c144f2feaab17622e5a5f2b6ee5"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" DROP CONSTRAINT "FK_6d28e46182ca0b0777da9bbeca6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" DROP CONSTRAINT "FK_3605a7ccb2c31283c2f438d42d6"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "FK_d5d963070db3c19968c193f778d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "FK_49c6beb4906102777590b508e5b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "FK_97b106f98cb47ae955d8866cb7f"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" DROP CONSTRAINT "FK_ab41a604cb75dce9558c50fc4e1"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" DROP CONSTRAINT "FK_5bf30c50d712bae277ca356acea"`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" DROP CONSTRAINT "FK_17a45017ebe3e6d8927e89067b8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" DROP CONSTRAINT "FK_f5704c32d99232983a361d94a90"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" DROP CONSTRAINT "FK_448cfaab5f56b0f67cc66b2403c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" DROP CONSTRAINT "FK_2a1ac178b973083122b1d4d2f39"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" DROP CONSTRAINT "FK_b2bef2256cfcf7a3e5eaeb20716"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" DROP CONSTRAINT "FK_925cc591b88a93fc66156432dec"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" DROP CONSTRAINT "FK_7ca6e761a24b38013ad38713aa5"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" DROP CONSTRAINT "FK_5139ae6a60c799552ba18c91c68"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" DROP CONSTRAINT "FK_80c457bc2a7f83aa7a38f07abcc"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "FK_44b3054dbccf94b5385e7c16a5d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "FK_bad2f837ce966cd4d0a7a4869da"`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" DROP CONSTRAINT "FK_65545b07c020cbdbbb7681608c2"`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" DROP CONSTRAINT "FK_4d256e74fdf7dfc7fe3db8646d4"`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" DROP CONSTRAINT "FK_706c0604b9eb1cb34a129eedd4c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" DROP CONSTRAINT "UQ_4506ac004b42bda1c05c9f50d4b"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" DROP CONSTRAINT "UQ_2dd329fd2d58f76a91adf74c319"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" DROP CONSTRAINT "UQ_f6d30be760546ea0ff914492481"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" DROP CONSTRAINT "UQ_ef9b6e6695967a6bec70cfa82e5"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" DROP CONSTRAINT "UQ_2a3b2e826050270b3c8f16d744f"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" DROP CONSTRAINT "UQ_d61a7b41ce460cd75b4a447b7fe"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" DROP CONSTRAINT "UQ_0abb2c9a9bb102f2c15a2ce4b7b"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_5b1383a0a5833c8ce57ac9e902"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_0066d0f76c559975436f6959ca"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_ffa952eeba5891d7cade013b2a"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_77536dbdf2b176b8b3a3fda80f"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_76f1e5bdc59b92b8f35f0aa088"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_90c53c368c305aca2db967e385"`,
		);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_a132ab33e1fe4d45c71b6a7565"`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" DROP CONSTRAINT "UQ_ba1bbac7f0863173f40863e272c"`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "aggregators"."ddex_name" IS 'Full Name of DDEX Party. VD: Spotify'`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" DROP COLUMN "ddex_id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ADD "ddex_id" character varying(50)`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "is_default" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "is_active" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."routing_mode_enum_old" AS ENUM('direct', 'aggregator', 'system')`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "mode" TYPE "public"."routing_mode_enum_old" USING "mode"::"text"::"public"."routing_mode_enum_old"`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."dsp_routing_configs_mode_enum"`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."routing_mode_enum_old" RENAME TO "routing_mode_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "UQ_3f1bd64741fa999af4bda1e5498"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" DROP CONSTRAINT "UQ_0fb50fcb3d9e592111076ac413d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "app_config"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "app_config"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "app_config"."id" IS 'ID cấu hình ứng dụng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "refresh_tokens" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "refresh_tokens"."id" IS 'ID refresh token'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."modifier_id" IS 'Người cập nhật phiên quét'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."creator_id" IS 'Người tạo phiên quét'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_status" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_status"."id" IS 'ID phiên quét'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "backups"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "backups"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "backups" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "backups" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "backups"."id" IS 'ID phiên backup'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."status" IS 'Trạng thái bài viết (private / public / draft...)'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP COLUMN "status"`,
		);
		await queryRunner.query(`DROP TYPE "public"."news_posts_status_enum"`);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD "status" character varying(10) NOT NULL DEFAULT 'private'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."thumbnail" IS 'Ảnh thumbnail của bài viết'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" DROP COLUMN "thumbnail"`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD "thumbnail" character varying(300)`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts"."id" IS 'ID bài viết tin tức'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_posts_translation"."id" IS 'ID bản dịch bài viết'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_categories" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "news_categories"."id" IS 'ID danh mục tin tức'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."tenant_id" IS 'ID tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."role_id" IS 'ID role'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."user_id" IS 'ID user'`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "user_role"."id" IS 'ID user_role'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."note" IS 'Ghi chú hoặc mô tả thêm cho vai trò'`,
		);
		await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "roles" ADD "note" character varying(1000)`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "code" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "roles"."id" IS 'ID vai trò'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "role_permission" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "role_permission"."id" IS 'ID liên kết role - permission'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."note" IS 'Mô tả hoặc ghi chú cho quyền hạn'`,
		);
		await queryRunner.query(`ALTER TABLE "permissions" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "permissions" ADD "note" character varying(1000)`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "permissions"."id" IS 'ID quyền hạn'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."last_ip" IS 'IP đăng nhập cuối'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."last_active" IS 'Lần hoạt động cuối'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."last_login" IS 'Lần đăng nhập cuối'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."email_verified" IS 'Trạng thái xác minh email'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."is_active" IS 'Trạng thái kích hoạt'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."type" IS 'Loại user'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."avatar" IS 'Ảnh đại diện'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."telegram_id" IS 'Telegram ID'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."email" IS 'Email đăng nhập'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "users"."name" IS 'Tên người dùng'`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "users"."id" IS 'ID user'`);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."user_id" IS 'ID user'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."tenant_id" IS 'ID tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."type" IS 'Loại user trong tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_user" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_user"."id" IS 'ID tenant_user'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."parent_id" IS 'ID tenant cha'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."owner_id" IS 'Chủ sở hữu tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."tenant_tier_id" IS 'ID gói dịch vụ tenant đang áp dụng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."primary_color" IS 'Màu chủ đạo của tenant'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."modifier_id" IS 'Người cập nhật tenant'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."creator_id" IS 'Người tạo tenant'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenants"."id" IS 'ID tenant'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "color" SET DEFAULT '#FFFFFF'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."max_score" IS 'Điểm tối đa của tier'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."min_score" IS 'Điểm tối thiểu để đạt tier'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "UQ_6130d69062f52786a4e2951291d"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "UQ_7b3719fe941c20f3b26cc287bb0"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP CONSTRAINT "UQ_1361216552af8fabd84ca755e8e"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "modifier_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "creator_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP COLUMN "updated_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" DROP COLUMN "created_at"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_tiers"."id" IS 'ID tenant tier'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."description" IS 'Mô tả issue cho tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."end_date_affect" IS 'Thời điểm kết thúc ảnh hưởng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."start_date_affect" IS 'Thời điểm bắt đầu ảnh hưởng'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."score" IS 'Điểm override cho issue'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_issue"."id" IS 'ID tenant issue'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."issue_level_id" IS 'ID cấp độ issue'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."score" IS 'Điểm cơ bản của issue'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "UQ_6305c7187da0b29acd037499122"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" DROP CONSTRAINT "UQ_03abb6b2759dd9dfaf8231cdda4"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issues"."id" IS 'ID issue'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."weight" IS 'Hệ số nhân điểm cho issue'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."severity_rank" IS 'Thứ hạng mức độ nghiêm trọng'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" DROP CONSTRAINT "UQ_6720ecdc6b769195e27376ff4b8"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" DROP CONSTRAINT "UQ_dec0d644fd893e07338a00f650a"`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "issue_level" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "issue_level"."id" IS 'ID cấp độ issue'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_dsp"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_dsp"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tenant_dsp"."id" IS 'ID cấu hình tenant - DSP'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."ddex_name" IS 'Full Name of DDEX Party. VD: Spotify'`,
		);
		await queryRunner.query(`ALTER TABLE "dsps" DROP COLUMN "ddex_id"`);
		await queryRunner.query(
			`ALTER TABLE "dsps" ADD "ddex_id" character varying(50)`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsps" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsps"."id" IS 'ID DSP (custom)'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" DROP COLUMN "mode"`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."dsp_routing_settings_mode_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD "mode" character varying NOT NULL DEFAULT 'AGGREGATOR'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`ALTER TABLE "delivery_configs" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "delivery_configs" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_profiles" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_profiles"."id" IS 'ID hồ sơ nghệ sĩ trên DSP'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "is_scanned" DROP NOT NULL`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."artist_source_enum_old" AS ENUM('music_brainz', 'ant_music', 'ada', 'spotify', 'apple')`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" TYPE "public"."artist_source_enum_old" USING "artist_source"::"text"::"public"."artist_source_enum_old"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "artist_source" SET DEFAULT 'ant_music'`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."artists_artist_source_enum"`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."artist_source_enum_old" RENAME TO "artist_source_enum"`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artists"."id" IS 'ID nghệ sĩ (custom)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "countries"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "countries"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "countries" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "countries" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "countries"."id" IS 'ID quốc gia'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."metadata_language_id" IS 'Ngôn ngữ metadata của release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."audio_language_id" IS 'Ngôn ngữ audio của release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."metadata_language_country_id" IS 'Quốc gia dùng cho metadata ngôn ngữ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_language" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_language"."id" IS 'ID cấu hình ngôn ngữ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "languages"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "languages"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "languages" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "languages" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "languages"."id" IS 'ID ngôn ngữ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."version" IS 'Phiên bản release theo ngôn ngữ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_localize" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_localize"."id" IS 'ID bản địa hóa release'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "tenant_id" DROP NOT NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."release_date" IS 'Ngày phát hành'`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."release_time_mode_old" AS ENUM('global_midnight', 'specific_timezone')`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" TYPE "public"."release_time_mode_old" USING "release_time_mode"::"text"::"public"."release_time_mode_old"`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "release_time_mode" SET DEFAULT 'global_midnight'`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."releases_release_time_mode_enum"`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."release_time_mode_old" RENAME TO "release_time_mode"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."is_various_artist" IS 'Đánh dấu release nhiều nghệ sĩ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."p_line_owner" IS 'Chủ sở hữu P-Line'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."p_line_year" IS 'Năm P-Line (bản quyền sản xuất)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."c_line_owner" IS 'Chủ sở hữu C-Line'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."c_line_year" IS 'Năm C-Line (bản quyền ghi âm)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."title" IS 'Tiêu đề release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."label_id" IS 'Label phát hành'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."primary_genre_id" IS 'Thể loại chính'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "releases" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "releases"."id" IS 'ID release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "timezones"."zone" IS 'Tên zone chuẩn'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "timezones"."utc" IS 'Độ lệch UTC'`,
		);
		await queryRunner.query(
			`ALTER TABLE "timezones" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "timezones" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "timezones"."id" IS 'ID múi giờ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."distribution_type" IS 'Loại phân phối theo lãnh thổ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."distribute_worldwide" IS 'Phân phối toàn cầu'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_territories" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_territories"."id" IS 'ID cấu hình lãnh thổ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_dsp_delivery"."last_delivered_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_dsp_delivery"."last_enqueued_at" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_dsp_delivery"."status" IS NULL`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."release_dsp_status_old" AS ENUM('draft', 'processing', 'issues', 'never_distributed', 'distributed', 'taken_down')`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" TYPE "public"."release_dsp_status_old" USING "status"::"text"::"public"."release_dsp_status_old"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "status" SET DEFAULT 'draft'`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."release_dsp_delivery_status_enum"`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."release_dsp_status_old" RENAME TO "release_dsp_status"`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_cover_art" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_cover_art"."id" IS 'ID ảnh bìa release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_contributors"."id" IS 'ID contributor - release'`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "album_formats" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "album_formats"."id" IS 'ID định dạng album (custom)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "release_artist"."id" IS 'ID liên kết nghệ sĩ - release'`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" DROP CONSTRAINT "UQ_430ce333ab69091340a9cf00707"`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "labels" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "labels"."id" IS 'ID label (custom)'`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "genres" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "genres"."id" IS 'ID thể loại nhạc (custom)'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."price_tier_id" IS 'Price tier áp dụng cho track'`,
		);
		await queryRunner.query(
			`CREATE TYPE "public"."scan_copyright_status_enum_old" AS ENUM('un_scanned', 'finished', 'warning', 'rejected')`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" TYPE "public"."scan_copyright_status_enum_old" USING "scan_copyright_status"::"text"::"public"."scan_copyright_status_enum_old"`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ALTER COLUMN "scan_copyright_status" SET DEFAULT 'un_scanned'`,
		);
		await queryRunner.query(
			`DROP TYPE "public"."tracks_scan_copyright_status_enum"`,
		);
		await queryRunner.query(
			`ALTER TYPE "public"."scan_copyright_status_enum_old" RENAME TO "scan_copyright_status_enum"`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."track_origin_type_id" IS 'Nguồn gốc track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."track_type_id" IS 'Loại track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."primary_genre_id" IS 'Thể loại chính'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."p_line_owner" IS 'Chủ sở hữu P-Line'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."p_line_year" IS 'Năm P-Line'`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "uq_tracks_isrc" UNIQUE ("isrc")`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."version" IS 'Phiên bản track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "tracks"."id" IS 'ID track'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_3e73e5b396eb06fee80bfb65e17" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_types"."is_default" IS 'Loại track mặc định'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_types" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_types"."id" IS 'ID loại track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."icon" IS 'Icon mức độ nhạy cảm'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."name" IS 'Tên mức độ nhạy cảm'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_sensitives"."id" IS 'ID mức độ nhạy cảm'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."track_id" IS 'ID track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."configuration" IS 'Cấu hình phân phối từ DSP'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ALTER COLUMN "amount" TYPE numeric(24,6)`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."currency_code" IS 'Mã tiền tệ ISO-4217'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."country_code" IS 'Mã quốc gia ISO-2'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."dsp_id" IS 'ID DSP'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_revenue"."report_date" IS 'Ngày phát sinh doanh thu'`,
		);
		await queryRunner.query(
			`CREATE SEQUENCE IF NOT EXISTS "track_revenue_id_seq" OWNED BY "track_revenue"."id"`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ALTER COLUMN "id" SET DEFAULT nextval('"track_revenue_id_seq"')`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."dsp_id" IS 'ID DSP'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."action_id" IS 'ID hành động'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_policy"."id" IS 'ID chính sách track'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_38cd5eb62ea942104ee8fb42958" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."note" IS 'Mô tả hoặc ghi chú cho hành động'`,
		);
		await queryRunner.query(`ALTER TABLE "actions" DROP COLUMN "note"`);
		await queryRunner.query(
			`ALTER TABLE "actions" ADD "note" character varying(200)`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."updated_at" IS 'Thời điểm cập nhật'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."created_at" IS 'Thời điểm tạo'`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "actions" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "actions"."id" IS 'ID hành động'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsp_action"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsp_action"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "dsp_action"."id" IS 'ID mapping DSP - Action'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_origin_types"."is_default" IS 'Loại nguồn gốc mặc định'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_origin_types" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_origin_types"."id" IS 'ID loại nguồn gốc track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."is_from_track_action" IS 'Tạo từ chỉnh sửa track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."is_from_release_action" IS 'Tạo từ đồng bộ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."release_contributor_id" IS 'ID release_contributor đồng bộ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."artist_role_id" IS 'ID vai trò nghệ sĩ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."artist_id" IS 'ID nghệ sĩ'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_contributors"."id" IS 'ID contributor - track'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "artist_roles" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "artist_roles"."id" IS 'ID vai trò nghệ sĩ'`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "price_tiers"."id" IS 'ID price tier'`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "modifier_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."modifier_id" IS 'Người cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "creator_id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."creator_id" IS 'Người tạo bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "currencies" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "currencies"."id" IS 'ID tiền tệ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_scan_histories" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_scan_histories"."id" IS 'ID lịch sử quét'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."version" IS 'Phiên bản track theo ngôn ngữ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."track_id" IS 'ID track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."language_id" IS 'ID ngôn ngữ'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_localize" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_localize"."id" IS 'ID localize track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."recording_country_id" IS 'Quốc gia thu âm'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."metadata_language_id" IS 'Ngôn ngữ metadata'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."audio_language_id" IS 'Ngôn ngữ audio'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."metadata_language_country_id" IS 'Quốc gia metadata'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_language" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_language"."id" IS 'ID cấu hình ngôn ngữ track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."is_from_track_action" IS 'Tạo từ thao tác chỉnh sửa track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."is_from_release_action" IS 'Tạo từ thao tác đồng bộ release'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."release_artist_id" IS 'ID release_artist đồng bộ'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."artist_id" IS 'ID nghệ sĩ'`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "track_artist"."id" IS 'ID liên kết artist - track'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."preview" IS 'Thời lượng preview, tính bằng giây - cho phép null khi draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."sample_length" IS 'Số mẫu âm thanh - cho phép null khi draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."bit_depth" IS 'Độ sâu bit (bit depth) - cho phép null khi draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."bitrate" IS 'Bitrate (Mbps) - cho phép null khi draft'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "audio_files" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "audio_files"."id" IS 'ID file audio'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "files"."updated_at" IS 'Thời điểm cập nhật bản ghi'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "files"."created_at" IS 'Thời điểm tạo bản ghi'`,
		);
		await queryRunner.query(
			`ALTER TABLE "files" ALTER COLUMN "id" DROP DEFAULT`,
		);
		await queryRunner.query(
			`ALTER TABLE "files" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
		);
		await queryRunner.query(`COMMENT ON COLUMN "files"."id" IS 'ID file'`);
		await queryRunner.query(`ALTER TABLE "i18n" DROP COLUMN "value"`);
		await queryRunner.query(`ALTER TABLE "i18n" DROP COLUMN "key"`);
		await queryRunner.query(
			`ALTER TABLE "aggregators" ADD "dspusagecount" integer DEFAULT '0'`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" ADD "acr_cloud" jsonb`,
		);
		await queryRunner.query(
			`ALTER TABLE "app_config" ADD "telegram" jsonb`,
		);
		await queryRunner.query(
			`ALTER TABLE "i18n" ADD "i18n_value" text NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "i18n" ADD "i18n_key" text NOT NULL`,
		);
		await queryRunner.query(
			`ALTER TABLE "roles" ADD "name;code;note" character varying(128)`,
		);
		await queryRunner.query(
			`ALTER TABLE "permissions" ADD "name;code;note" character varying(128)`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD "logins_count" integer NOT NULL DEFAULT '0'`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD "code1" character varying`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "artists_code1_key" UNIQUE ("code1")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD "artist_role_id" uuid`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD "is_sensitive_content" boolean DEFAULT false`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD "artist_role_id" uuid`,
		);
		await queryRunner.query(`DROP TABLE "system_settings"`);
		await queryRunner.query(
			`DROP INDEX "public"."IDX_48cce8c8e9830e5a732b3ad39a"`,
		);
		await queryRunner.query(`DROP TABLE "dsp_release_status"`);
		await queryRunner.query(
			`DROP TYPE "public"."dsp_release_status_status_enum"`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "user_role" IS 'Bảng gán role cho user theo tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "users" IS 'Bảng người dùng hệ thống'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "tenant_user" IS 'Bảng liên kết user với tenant'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "release_dsp_delivery" IS NULL`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "release_contributors" IS 'Bảng liên kết contributor với release theo vai trò'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_types" IS 'Danh mục loại track'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_sensitives" IS 'Danh mục mức độ nhạy cảm nội dung của track'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_revenue" IS 'Bảng lưu doanh thu của track theo DSP, quốc gia và ngày'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_origin_types" IS 'Danh mục nguồn gốc của track'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_contributors" IS 'Bảng liên kết contributor tham gia từng track'`,
		);
		await queryRunner.query(
			`COMMENT ON TABLE "track_localize" IS 'Bảng lưu bản địa hóa tiêu đề track'`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "uq_news_post_lang" UNIQUE ("news_post_id", "language_code")`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "uq_user_role" UNIQUE ("user_id", "role_id", "tenant_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ADD CONSTRAINT "uq_tenant_dsp" UNIQUE ("dsp_id", "tenant_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "uq_release_dsp_delivery" UNIQUE ("release_id", "dsp_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "uq_release_contributors" UNIQUE ("artist_role_id", "artist_id", "release_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "UQ_318c2a24200bde54aa82f90199d" UNIQUE ("artist_role_id", "artist_id", "release_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_action" ADD CONSTRAINT "uq_dsp_action" UNIQUE ("dsp_id", "action_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "UQ_track_contributors_unique" UNIQUE ("artist_id", "artist_role_id", "track_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "UQ_462c73f56c560514608a0319011" UNIQUE ("artist_id", "artist_role_id", "track_id")`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "ck_tenant_issue_dates" CHECK (((end_date_affect IS NULL) OR (start_date_affect IS NULL) OR (end_date_affect >= start_date_affect)))`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "chk_dsp_routing_settings_mode_config" CHECK (((((mode)::text = 'DIRECT'::text) AND (direct_config_id IS NOT NULL) AND (specific_aggregator_config_id IS NULL)) OR (((mode)::text = 'AGGREGATOR'::text) AND (direct_config_id IS NULL))))`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_distribution_ci_history_upc" ON "distribution_ci_history" ("upc") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_distribution_ci_history_batch_id" ON "distribution_ci_history" ("batch_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_distribution_ci_history_release_created_at" ON "distribution_ci_history" ("created_at", "release_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_sftp_configs_dsp_id" ON "sftp_configs" ("dsp_id") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "ux_sftp_configs_aggregator_id" ON "sftp_configs" ("aggregator_id") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "ux_aggregators_code" ON "aggregators" ("code") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "ux_dsp_routing_configs_dsp_id" ON "dsp_routing_configs" ("dsp_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dsp_routing_configs_sftp_config_id" ON "dsp_routing_configs" ("sftp_config_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dsp_routing_configs_dsp_id" ON "dsp_routing_configs" ("dsp_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dsp_routing_configs_aggregator_id" ON "dsp_routing_configs" ("aggregator_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "ix_i18n_key" ON "i18n" ("i18n_key") `,
		);
		await queryRunner.query(
			`CREATE INDEX "ix_i18n_locale" ON "i18n" ("locale") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "uq_i18n_key_locale" ON "i18n" ("i18n_key", "locale") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_user_role_user" ON "user_role" ("user_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_user_role_tenant" ON "user_role" ("tenant_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_user_role_role" ON "user_role" ("role_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dsp_routing_settings_specific_agg_config_id" ON "dsp_routing_settings" ("specific_aggregator_config_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_dsp_routing_settings_direct_config_id" ON "dsp_routing_settings" ("direct_config_id") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "ux_delivery_configs_name" ON "delivery_configs" ("name") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_rdd_last_delivered_at" ON "release_dsp_delivery" ("last_delivered_at") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_rdd_last_enqueued_at" ON "release_dsp_delivery" ("last_enqueued_at") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_rdd_status" ON "release_dsp_delivery" ("status") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_rdd_dsp_id" ON "release_dsp_delivery" ("dsp_id") `,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_rdd_release_id" ON "release_dsp_delivery" ("release_id") `,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "uniq_release_cover_original" ON "release_cover_art" ("release_id", "type") WHERE ((type)::text = 'original'::text)`,
		);
		await queryRunner.query(
			`ALTER TABLE "distribution_ci_history" ADD CONSTRAINT "fk_distribution_ci_history_release" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "sftp_configs" ADD CONSTRAINT "fk_sftp_configs_aggregator" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "fk_dsp_routing_configs_aggregator" FOREIGN KEY ("aggregator_id") REFERENCES "aggregators"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_configs" ADD CONSTRAINT "fk_dsp_routing_configs_sftp_config" FOREIGN KEY ("sftp_config_id") REFERENCES "sftp_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts" ADD CONSTRAINT "fk_news_category" FOREIGN KEY ("news_category_id") REFERENCES "news_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "news_posts_translation" ADD CONSTRAINT "fk_news_post" FOREIGN KEY ("news_post_id") REFERENCES "news_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "fk_user_role_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "fk_user_role_modifier" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "fk_user_role_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "fk_user_role_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_role" ADD CONSTRAINT "fk_user_role_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenants" ADD CONSTRAINT "fk_tenants_tenant_tier" FOREIGN KEY ("tenant_tier_id") REFERENCES "tenant_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "fk_tenant_tiers_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_tiers" ADD CONSTRAINT "fk_tenant_tiers_modifier" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "fk_tenant_issue_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "fk_tenant_issue_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE NO ACTION ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "fk_tenant_issue_modifier" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_issue" ADD CONSTRAINT "fk_tenant_issue_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "issues" ADD CONSTRAINT "fk_issue_level" FOREIGN KEY ("issue_level_id") REFERENCES "issue_level"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ADD CONSTRAINT "fk_tenant_dsp_dsp" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tenant_dsp" ADD CONSTRAINT "fk_tenant_dsp_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "fk_dsp_routing_settings_dsp" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "fk_dsp_routing_settings_direct_config" FOREIGN KEY ("direct_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "dsp_routing_settings" ADD CONSTRAINT "fk_dsp_routing_settings_specific_agg_config" FOREIGN KEY ("specific_aggregator_config_id") REFERENCES "delivery_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "fk_artists_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "artists" ADD CONSTRAINT "fk_artists_genre" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "fk_release_dsp_delivery_release" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_dsp_delivery" ADD CONSTRAINT "fk_release_dsp_delivery_dsp" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "fk_release_contributors_artist_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "fk_release_contributors_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_contributors" ADD CONSTRAINT "fk_release_contributors_release" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "fk_release_artist_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "fk_release_artist_release" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "release_artist" ADD CONSTRAINT "fk_release_artist_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "fk_tracks_price_tier" FOREIGN KEY ("price_tier_id") REFERENCES "price_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "fk_tracks_release" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "tracks" ADD CONSTRAINT "fk_tracks_track_sensitive" FOREIGN KEY ("track_sensitive_id") REFERENCES "track_sensitives"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ADD CONSTRAINT "fk_track_sensitive_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_sensitives" ADD CONSTRAINT "fk_track_sensitive_modifier" FOREIGN KEY ("modifier_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ADD CONSTRAINT "fk_track" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_revenue" ADD CONSTRAINT "fk_track_revenue_dsp" FOREIGN KEY ("dsp_id") REFERENCES "dsps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "FK_d75145347d0d7237e7b3ada91e9" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_policy" ADD CONSTRAINT "track_policy_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "fk_track_contributors_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "fk_track_contributors_release_contributor" FOREIGN KEY ("release_contributor_id") REFERENCES "release_contributors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "fk_track_contributors_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_contributors" ADD CONSTRAINT "fk_track_contributors_track" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "price_tiers" ADD CONSTRAINT "FK_price_tiers_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "fk_track_artist_artist" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "fk_track_artist_release_artist" FOREIGN KEY ("release_artist_id") REFERENCES "release_artist"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "fk_track_artist_role" FOREIGN KEY ("artist_role_id") REFERENCES "artist_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
		await queryRunner.query(
			`ALTER TABLE "track_artist" ADD CONSTRAINT "fk_track_artist_track" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
		);
	}
}
