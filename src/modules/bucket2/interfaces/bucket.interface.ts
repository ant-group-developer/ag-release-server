import { Readable } from 'stream';
import { FileEntity } from '../entities/bucket.file.entity';

export interface IResCreateBucket {
	fileId: string;
	urlUpload: string;
	key: string | null;
}

// file
export interface ICreateFile {
	fileName: string;
	contentType: string;
	extension: string;
	fileSize: number;
	key: string;
	bucket: string;
}
// gcs
export interface IGetSignedUrlUpload {
	key: string;
	contentType: string;
	isPublic?: boolean;
}

export interface IGetSignedUrlRead {
	key: string;
	isPublic?: boolean;
	bucket?: string;
}

export interface IGetSignedUrlDown {
	key: string;
	isPublic?: boolean;
	fileName: string;
	bucket?: string;
}

export interface IInitiateMultipartUploadResponse {
	fileId: string;
	key: string;
	partSize: number;
	partCount: number;
	expiresAt: Date;
}

export interface IMultipartUploadResult {
	fileId: string;
	key: string;
	fileSize: number;
	contentType: string;
	readUrl: string;
	downloadUrl: string;
}

export interface IListUploadedPartsResponse {
	fileId: string;
	partSize: number;
	partCount: number;
	parts: Array<{
		partNumber: number;
		eTag: string;
		size: number;
	}>;
}

export type OpenFileStreamResult = {
	file: FileEntity;
	stream: Readable;
};
