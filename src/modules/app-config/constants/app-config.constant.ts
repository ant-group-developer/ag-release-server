import {
	DEFAULT_AUTO_SCAN_TIME,
	DEFAULT_CHUNK_DURATION,
	DEFAULT_SCORE_WARNING,
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
		cronValue: '0 1 * * *',

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
};
