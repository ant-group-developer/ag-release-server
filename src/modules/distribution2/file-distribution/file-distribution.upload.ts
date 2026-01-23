// import SftpClient from 'ssh2-sftp-client';

// export async function uploadFolderSftp(input: {
// 	localDir: string;
// 	remoteDir: string;
// 	sftpConfig: {
// 		host: string;
// 		port?: number;
// 		username: string;
// 		password?: string;
// 		privateKey?: string;
// 	};
// }) {
// 	const { localDir, remoteDir, sftpConfig } = input;
// 	const sftp = new SftpClient();

// 	try {
// 		await sftp.connect(sftpConfig);

// 		// đảm bảo folder gốc tồn tại
// 		await ensureRemoteDir(sftp, remoteDir);

// 		// upload đệ quy giống FileZilla
// 		await uploadDirRecursive(sftp, localDir, remoteDir);
// 	} finally {
// 		await sftp.end();
// 	}
// }
