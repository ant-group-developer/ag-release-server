import { ReleaseStatus } from '../../release/enum/release.enum';
import {
	AppConfigKey,
	ExecuteCycleType,
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
	executeCycleType: ExecuteCycleType;

	executeConfig: {
		nMinutes?: number; // backup mỗi N phút
		nHours?: number; // backup mỗi N giờ
		nDays?: number; // backup mỗi N ngày

		dayOfWeek?: string; // backup hàng tuần: "monday", "tuesday", ...
		dayOfMonth?: number; // backup hàng tháng: 1–31
		time?: string; // giờ thực hiện: "1"
	};

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

export interface AppConfigShape {
	auth0: Auth0Config;
	website: WebsiteConfig;
	backupDatabase: BackupDatabase;
	telegram: Telegram;
	acrCloud: AcrCloud;
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
	[AppConfigKey.DATABASE_TO_DRIVE]: boolean;
	[AppConfigKey.DATABASE_TO_GCS]: boolean;
	[AppConfigKey.NOTIFY_ON_SUCCESS]: boolean;
	[AppConfigKey.NOTIFY_ON_FAILED]: boolean;

	//
	[AppConfigKey.TELEGRAM_TOKEN]: string;
	[AppConfigKey.CHAT_ID]: string;
};
