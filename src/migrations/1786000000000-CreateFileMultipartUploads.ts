import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFileMultipartUploads1786000000000
	implements MigrationInterface
{
	name = 'CreateFileMultipartUploads1786000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TYPE "file_multipart_upload_status_enum" AS ENUM (
				'initiated',
				'completing',
				'completed',
				'aborting',
				'aborted',
				'failed'
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "file_multipart_uploads" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
				"file_id" uuid NOT NULL,
				"upload_id" text NOT NULL,
				"tenant_id" uuid NOT NULL,
				"creator_id" uuid NOT NULL,
				"part_size" bigint NOT NULL,
				"part_count" integer NOT NULL,
				"status" "file_multipart_upload_status_enum"
					NOT NULL DEFAULT 'initiated',
				"expires_at" TIMESTAMPTZ NOT NULL,
				"completed_at" TIMESTAMPTZ,
				"aborted_at" TIMESTAMPTZ,
				"failure_reason" text,
				CONSTRAINT "PK_file_multipart_uploads" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_file_multipart_uploads_file_id" UNIQUE ("file_id"),
				CONSTRAINT "CHK_file_multipart_upload_part_size"
					CHECK ("part_size" >= 5242880),
				CONSTRAINT "CHK_file_multipart_upload_part_count"
					CHECK ("part_count" BETWEEN 1 AND 10000),
				CONSTRAINT "FK_file_multipart_upload_file"
					FOREIGN KEY ("file_id") REFERENCES "files"("id")
					ON DELETE RESTRICT ON UPDATE NO ACTION
			)
		`);

		await queryRunner.query(`
			UPDATE "app_config"
			SET "config" = jsonb_set(
				"config",
				'{multipartUpload}',
				jsonb_build_object(
					'partSizeMb', 128,
					'presignExpiresSeconds', 3600,
					'sessionExpiresSeconds', 86400,
					'maxFileSizeMb', 102400
				) || COALESCE("config"->'multipartUpload', '{}'::jsonb),
				true
			)
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE "app_config"
			SET "config" = "config" - 'multipartUpload'
			WHERE "config" ? 'multipartUpload'
		`);
		await queryRunner.query(
			'DROP TABLE IF EXISTS "file_multipart_uploads"',
		);
		await queryRunner.query(
			'DROP TYPE IF EXISTS "file_multipart_upload_status_enum"',
		);
	}
}
