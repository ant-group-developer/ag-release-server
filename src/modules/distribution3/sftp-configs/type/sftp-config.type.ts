export type SftpMetadata = {
	host: string; // sftp host
	port: number; // sftp port, ví dụ 22
	username: string;
	password: string; // nên encrypt khi lưu DB
	privateKey: string;
	path: string;
};
