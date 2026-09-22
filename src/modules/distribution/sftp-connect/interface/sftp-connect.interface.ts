import { Readable } from 'stream';
import { SftpMetadata } from '../../sftp-configs/type/sftp-config.type';

export type UploadStreamToS3Progress = {
	loaded: number;
	total: number;
	percent: number;
};

export type UploadStreamToS3Input = {
	storage: SftpMetadata;
	input: Readable;
	remoteDir: string;
	fileName: string;
	contentLength: number;
	queueSize?: number;
	partSize?: number;
	signal?: AbortSignal;
	onProgress?: (progress: UploadStreamToS3Progress) => void;
};

export type UploadStreamToS3Result = {
	bucket: string;
	key: string;
	eTag?: string;
	versionId?: string;
};
