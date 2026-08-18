import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFtpProviderConfigs1786200000000
	implements MigrationInterface
{
	name = 'CreateFtpProviderConfigs1786200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "ftp_provider_configs" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"creator_id" uuid,
				"modifier_id" uuid,
				"code" character varying(50) NOT NULL,
				"name" character varying(100) NOT NULL,
				"host" character varying NOT NULL,
				"port" integer NOT NULL DEFAULT 21,
				"username" character varying NOT NULL,
				"password_encrypted" text NOT NULL,
				"secure" character varying(20) NOT NULL DEFAULT 'explicit',
				"base_path" character varying NOT NULL DEFAULT '/root',
				"is_active" boolean NOT NULL DEFAULT false,
				"description" text,
				CONSTRAINT "PK_ftp_provider_configs_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_ftp_provider_configs_code" UNIQUE ("code")
			)
		`);

		// Chỉ 1 provider được active tại 1 thời điểm — luồng sync/discovery hiện
		// tại chưa biết khái niệm "nhiều provider chạy đồng thời".
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_ftp_provider_configs_single_active"
			ON "ftp_provider_configs" ("is_active")
			WHERE "is_active" = true
		`);

		await queryRunner.query(
			`COMMENT ON TABLE "ftp_provider_configs" IS 'FTP credentials cho ETL pull report (Merlin, va cac DSP khac sau nay). Chi 1 row is_active=true dung cho luong sync/discovery hien tai'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "ftp_provider_configs"."code" IS 'Slug dinh danh provider, vi du merlin'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "ftp_provider_configs"."password_encrypted" IS 'Ma hoa bang encryptSecret() (AES/crypto-js + CRYPTO_SECRET_KEY), cung co che voi sftp_configs.metadata.password'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "ftp_provider_configs"."secure" IS 'true | false | explicit | implicit'`,
		);
		await queryRunner.query(
			`COMMENT ON COLUMN "ftp_provider_configs"."is_active" IS 'Provider dang duoc FtpService dung cho sync/discovery. Enforce boi UQ_ftp_provider_configs_single_active'`,
		);

		// Seed 1 row tu .env hien tai (neu co) de sync khong bi dung ngay sau
		// deploy — FtpService se doc DB ra dung gia tri giong .env cu.
		const ftpHost = process.env.FTP_HOST;
		if (ftpHost) {
			const cryptoSecretKey = process.env.CRYPTO_SECRET_KEY;
			if (!cryptoSecretKey) {
				throw new Error(
					'Missing CRYPTO_SECRET_KEY in environment variables — required to encrypt seeded FTP password',
				);
			}

			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const CryptoJS = require('crypto-js');
			const ftpPassword = process.env.FTP_PASSWORD || '';
			const encryptedPassword = CryptoJS.AES.encrypt(
				ftpPassword,
				cryptoSecretKey,
			).toString();

			const ftpPort = parseInt(process.env.FTP_PORT || '21', 10);
			const ftpUser = process.env.FTP_USER || '';
			const ftpSecure = process.env.FTP_SECURE || 'explicit';
			const ftpBasePath = process.env.FTP_BASE_PATH || '/root';

			await queryRunner.query(
				`INSERT INTO "ftp_provider_configs"
					("code", "name", "host", "port", "username", "password_encrypted", "secure", "base_path", "is_active")
				VALUES
					($1, $2, $3, $4, $5, $6, $7, $8, true)`,
				[
					'merlin',
					'Merlin',
					ftpHost,
					ftpPort,
					ftpUser,
					encryptedPassword,
					ftpSecure,
					ftpBasePath,
				],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX IF EXISTS "UQ_ftp_provider_configs_single_active"`,
		);
		await queryRunner.query(`DROP TABLE "ftp_provider_configs"`);
	}
}
