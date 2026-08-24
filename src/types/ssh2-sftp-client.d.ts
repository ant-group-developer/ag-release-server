declare module 'ssh2-sftp-client' {
	export interface SftpConfig {
		host: string;
		port?: number;
		username: string;
		password?: string;
		privateKey?: string | Buffer;
		passphrase?: string;
		readyTimeout?: number;
	}

	export interface FileInfo {
		type: '-' | 'd' | 'l';
		name: string;
		size: number;
		modifyTime: number;
		accessTime: number;
		rights?: {
			user: string;
			group: string;
			other: string;
		};
		owner?: number;
		group?: number;
		longname: string;
	}

	export class SftpClient {
		constructor(name?: string);

		connect(config: SftpConfig): Promise<void>;
		end(): Promise<void>;

		put(
			localPath: string | Buffer | NodeJS.ReadableStream,
			remotePath: string,
			options?: any,
		): Promise<void>;

		fastPut(
			localPath: string,
			remotePath: string,
			options?: any,
		): Promise<string>;

		mkdir(path: string, recursive?: boolean): Promise<void>;
		exists(path: string): Promise<boolean | 'd' | '-' | 'l'>;
		rename(from: string, to: string): Promise<void>;

		list(path: string): Promise<FileInfo[]>;
		delete(path: string): Promise<void>;
		rmdir(path: string, recursive?: boolean): Promise<void>;
	}

	export default SftpClient;
}
