import { ReleaseStatus } from '../../release/enum/release.enum';
import {
	AppConfigKey,
	// ExecuteCycleType,
	ScheduleType,
} from '../enums/app-config.enum';

export interface Auth0Config {
	clientId: string;
	clientSecret: string;
	domain: string;
	audience: string;
	connectionName: string;
	timeSyncData: string;
}

export interface WebsiteConfig {
	name: string;
	logo: string | null;
	title: string;
	description: string;
}

export interface BackupDatabase {
	cronValue: string;

	// config
	fileName: string;
	shell: string;

	// Thông báo kết quả backup
	notifyOnFailed: boolean;
	notifyOnSuccess: boolean;

	// Đích lưu trữ
	toDrive: boolean; // lưu Google Drive
	toGcs: boolean; // lưu Google Cloud Storage
}

export interface Telegram {
	token: string;
	chatId: string;
}

export interface AcrCloud {
	//
	acrHost: string;
	acrAccessKey: string;
	acrAccessSecret: string;

	//
	chunkDuration: number;
	scoreWarning: number;
	autoScan: boolean;
	autoScanTime1?: {
		type: ScheduleType;
		value: string;
	};

	autoScanTime: string;
	releaseStatusAutoScans: ReleaseStatus[];
}

export interface GeneralConfig {
	sampleLength: number;
	preview: number;
}

export interface IGenerator {
	prefixUpcDefaultId: string;
	prefixIsrcDefaultId: string;

	API_KEY_GRPC_ISRC_UPC: string;

	DDEX_PARTY_ID_SENDER: string;
	DDEX_PARTY_NAME_SENDER: string;
}

export interface AppConfigShape {
	auth0: Auth0Config; // Cấu hình xác thực và phân quyền bằng Auth0
	website: WebsiteConfig; // Cấu hình website công khai (domain, branding, liên kết)
	backupDatabase: BackupDatabase; // Cấu hình sao lưu cơ sở dữ liệu và lịch backup
	telegram: Telegram; // Cấu hình bot Telegram và hệ thống thông báo
	acrCloud: AcrCloud; // Cấu hình ACRCloud dùng cho nhận diện âm thanh
	general: GeneralConfig; // Các cấu hình chung ở cấp độ toàn hệ thống
	generator: IGenerator;
}

export type AppConfigValueMap = {
	[AppConfigKey.ALL]: AppConfigShape;

	[AppConfigKey.WEBSITE]: WebsiteConfig;

	[AppConfigKey.ACR_HOST]: string;
	[AppConfigKey.ACR_ACCESS_KEY]: string;
	[AppConfigKey.ACR_ACCESS_SECRET]: string;
	[AppConfigKey.CHUNK_DURATION]: number;
	[AppConfigKey.SCORE_WARNING]: number;

	//
	[AppConfigKey.CRON_VALUE]: string;
	[AppConfigKey.FILE_NAME]: string;
	[AppConfigKey.SHELL]: string;
	[AppConfigKey.DATABASE_TO_DRIVE]: boolean;
	[AppConfigKey.DATABASE_TO_GCS]: boolean;
	[AppConfigKey.NOTIFY_ON_SUCCESS]: boolean;
	[AppConfigKey.NOTIFY_ON_FAILED]: boolean;

	//
	[AppConfigKey.TELEGRAM_TOKEN]: string;
	[AppConfigKey.CHAT_ID]: string;
	[AppConfigKey.GENERAL]: GeneralConfig;

	//
	[AppConfigKey.generator]: IGenerator;
};
