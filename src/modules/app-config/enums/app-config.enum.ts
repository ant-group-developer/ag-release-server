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
}

export enum ScheduleType {
	INTERVAL = 'interval',
	CRON = 'cron',
}
