export enum ExecuteCycleType {
	/** Chạy cách N phút (Every N Minutes). Ví dụ: mỗi 10 phút */
	N_MINUTES = 'n_minutes',

	/** Chạy hàng giờ (Hourly). Ví dụ: mỗi giờ vào phút thứ 30 */
	HOURLY = 'hourly',

	/** Chạy cách N giờ (Every N Hours). Ví dụ: mỗi 2 giờ lúc phút 15 */
	N_HOURS = 'n_hours',

	/** Chạy hàng ngày (Daily). Ví dụ: 01:30 mỗi ngày */
	DAILY = 'daily',

	/** Chạy cách N ngày (Every N Days). Ví dụ: 2 ngày 01:30 chạy 1 lần */
	N_DAYS = 'n_days',

	/** Chạy hàng tuần (Weekly). Ví dụ: 01:30 sáng thứ 2 hàng tuần */
	WEEKLY = 'weekly',

	/** Chạy hàng tháng (Monthly). Ví dụ: 01:30 sáng ngày 1 hàng tháng */
	MONTHLY = 'monthly',
}

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

	// backup
	DATABASE_TO_DRIVE = 'database_to_drive',
	DATABASE_TO_GCS = 'database_to_gcs',
}
