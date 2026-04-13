import { ReleaseStatus } from '../../release/enum/release.enum';
import {
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
	enable: boolean;
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
	toR2: boolean; // lưu Cloudflare R2
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

	DDEX_PARTY_ID_AMG: string;
	DDEX_PARTY_NAME_AMG: string;
}

export interface OtherAppconfig {
	fileCiTemplateId?: string | null;
	excelDataStartRow?: number | null;
}

export interface AppConfigShape {
	auth0: Auth0Config; // Cấu hình xác thực và phân quyền bằng Auth0
	website: WebsiteConfig; // Cấu hình website công khai (domain, branding, liên kết)
	backupDatabase: BackupDatabase; // Cấu hình sao lưu cơ sở dữ liệu và lịch backup
	telegram: Telegram; // Cấu hình bot Telegram và hệ thống thông báo
	acrCloud: AcrCloud; // Cấu hình ACRCloud dùng cho nhận diện âm thanh
	general: GeneralConfig; // Các cấu hình chung ở cấp độ toàn hệ thống
	generator: IGenerator;

	other: OtherAppconfig;
}
