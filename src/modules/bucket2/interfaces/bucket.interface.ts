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
