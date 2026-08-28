// src/common/utils/ftp-client.util.ts
import * as ftp from 'basic-ftp';

export interface FtpClientCredentials {
	host: string;
	port: number;
	user: string;
	password: string;
	secure: boolean | 'implicit';
}

/**
 * Opens exactly one FTP(S) connection with the given credentials, no retry, no
 * connection-limiter slot. Shared by `FtpService.connectClient()` (which wraps
 * this with retry + the connection limiter) and
 * `FtpProviderConfigService.testConnection()` (which wants a single fast
 * attempt, not multi-DSP retry). Kept dependency-free so neither module needs
 * to import the other and create a circular dependency.
 */
export async function connectFtpClient(
	credentials: FtpClientCredentials,
): Promise<ftp.Client> {
	const client = new ftp.Client();
	client.ftp.verbose = false;

	try {
		await client.access({
			host: credentials.host,
			port: credentials.port,
			user: credentials.user,
			password: credentials.password,
			secure: credentials.secure,
			secureOptions: { rejectUnauthorized: false },
		});
		enableFtpControlKeepAlive(client);
		return client;
	} catch (error) {
		client.close();
		throw error;
	}
}

/**
 * Merlin (and most FTPS servers) idle-drop the control socket while a large
 * file is transferring on the data connection. TCP keepalive on the control
 * socket is the cheapest way to stop that FIN.
 */
function enableFtpControlKeepAlive(client: ftp.Client): void {
	const socket = client.ftp?.socket;
	if (socket && typeof socket.setKeepAlive === 'function') {
		socket.setKeepAlive(true, 15_000);
	}
}

export function toFtpSecureOption(secure: string): boolean | 'implicit' {
	if (secure === 'implicit') return 'implicit';
	return secure === 'true' || secure === 'explicit';
}
