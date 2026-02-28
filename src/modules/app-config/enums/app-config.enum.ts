export enum AppConfigKey {
	// all
	ALL = 'all',

	// website
	WEBSITE = 'website',

	// acr
	ACR_HOST = 'acr_host',
	ACR_ACCESS_KEY = 'acr_access_key',
	ACR_ACCESS_SECRET = 'acr_access_secret',
	CHUNK_DURATION = 'chunk_duration',
	SCORE_WARNING = 'score_warning',

	// backup
	CRON_VALUE = 'cron_value',
	FILE_NAME = 'file_name',
	SHELL = 'shell',

	DATABASE_TO_DRIVE = 'database_to_drive',
	DATABASE_TO_GCS = 'database_to_gcs',
	NOTIFY_ON_SUCCESS = 'notify_on_success',
	NOTIFY_ON_FAILED = 'notify_on_failed',

	// telegram
	TELEGRAM_TOKEN = 'telegram_token',
	CHAT_ID = 'chat_id',

	// track
	GENERAL = 'general',
	generator = 'generator',
}

export enum AppConfigKey2 {
	/* ================= AUTH0 ================= */
	AUTH0_CLIENT_ID = 'config.auth0.clientId',
	AUTH0_CLIENT_SECRET = 'config.auth0.clientSecret',
	AUTH0_DOMAIN = 'config.auth0.domain',
	AUTH0_AUDIENCE = 'config.auth0.audience',
	AUTH0_CONNECTION_NAME = 'config.auth0.connectionName',
	AUTH0_TIME_SYNC_DATA = 'config.auth0.timeSyncData',

	/* ================= WEBSITE ================= */
	WEBSITE_NAME = 'config.website.name',
	WEBSITE_LOGO = 'config.website.logo',
	WEBSITE_TITLE = 'config.website.title',
	WEBSITE_DESCRIPTION = 'config.website.description',

	/* ================= BACKUP DATABASE ================= */
	BACKUP_CRON_VALUE = 'config.backupDatabase.cronValue',
	BACKUP_FILE_NAME = 'config.backupDatabase.fileName',
	BACKUP_SHELL = 'config.backupDatabase.shell',
	BACKUP_NOTIFY_ON_FAILED = 'config.backupDatabase.notifyOnFailed',
	BACKUP_NOTIFY_ON_SUCCESS = 'config.backupDatabase.notifyOnSuccess',
	BACKUP_TO_DRIVE = 'config.backupDatabase.toDrive',
	BACKUP_TO_GCS = 'config.backupDatabase.toGcs',

	/* ================= TELEGRAM ================= */
	TELEGRAM_TOKEN = 'config.telegram.token',
	TELEGRAM_CHAT_ID = 'config.telegram.chatId',

	/* ================= ACR CLOUD ================= */
	ACR_HOST = 'config.acrCloud.acrHost',
	ACR_ACCESS_KEY = 'config.acrCloud.acrAccessKey',
	ACR_ACCESS_SECRET = 'config.acrCloud.acrAccessSecret',
	ACR_CHUNK_DURATION = 'config.acrCloud.chunkDuration',
	ACR_SCORE_WARNING = 'config.acrCloud.scoreWarning',
	ACR_AUTO_SCAN = 'config.acrCloud.autoScan',
	ACR_AUTO_SCAN_TIME = 'config.acrCloud.autoScanTime',
	ACR_RELEASE_STATUS_AUTO_SCANS = 'config.acrCloud.releaseStatusAutoScans',

	/* ================= GENERAL ================= */
	GENERAL_SAMPLE_LENGTH = 'config.general.sampleLength',
	GENERAL_PREVIEW = 'config.general.preview',

	/* ================= GENERATOR ================= */
	GENERATOR_PREFIX_UPC_DEFAULT_ID = 'config.generator.prefixUpcDefaultId',
	GENERATOR_PREFIX_ISRC_DEFAULT_ID = 'config.generator.prefixIsrcDefaultId',
	GENERATOR_API_KEY_GRPC_ISRC_UPC = 'config.generator.API_KEY_GRPC_ISRC_UPC',
	GENERATOR_DDEX_PARTY_ID_SENDER = 'config.generator.DDEX_PARTY_ID_SENDER',
	GENERATOR_DDEX_PARTY_NAME_SENDER = 'config.generator.DDEX_PARTY_NAME_SENDER',
}

export enum ScheduleType {
	INTERVAL = 'interval',
	CRON = 'cron',
}
