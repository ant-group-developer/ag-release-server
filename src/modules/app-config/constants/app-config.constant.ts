import {
	DEFAULT_AUTO_SCAN_TIME,
	DEFAULT_CHUNK_DURATION,
	DEFAULT_CRON_VALUE,
	DEFAULT_FILE_NAME_BACKUP,
	DEFAULT_SCORE_WARNING,
	DEFAULT_SHELL,
} from 'src/common/constants/common.default.constants';
import { ReleaseStatus } from '../../release/enum/release.enum';
import { AppConfigShape } from '../interfaces/app-config.type';

export const appConfigDefault: AppConfigShape = {
	auth0: {
		clientId: '',
		clientSecret: '',
		domain: '',
		audience: '',
		connectionName: '',
		timeSyncData: '',
	},

	website: {
		name: 'Ant Release',
		logo: '',
		title: 'Ant Release',
		description: 'Ant Release',
	},

	backupDatabase: {
		cronValue: DEFAULT_CRON_VALUE,

		fileName: DEFAULT_FILE_NAME_BACKUP,
		shell: DEFAULT_SHELL,

		notifyOnFailed: true,
		notifyOnSuccess: true,

		toDrive: false,
		toGcs: true,
	},

	telegram: {
		token: '',
		chatId: '',
	},

	acrCloud: {
		acrHost: '',
		acrAccessKey: '',
		acrAccessSecret: '',

		chunkDuration: DEFAULT_CHUNK_DURATION,
		scoreWarning: DEFAULT_SCORE_WARNING,
		autoScan: false,
		autoScanTime: DEFAULT_AUTO_SCAN_TIME,
		releaseStatusAutoScans: [ReleaseStatus.DRAFT],
	},

	general: {
		sampleLength: 60,
		preview: 60 + 42,
	},

	generator: {
		prefixUpcDefaultId: '',
		prefixIsrcDefaultId: '',
		API_KEY_GRPC_ISRC_UPC: '',
		DDEX_PARTY_ID_SENDER: '',
		DDEX_PARTY_NAME_SENDER: '',
	},

	other: {
		fileCiTemplateId: '',
	},
};
