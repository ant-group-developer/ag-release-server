// test-sftp.js
// npm i ssh2-sftp-client

const Client = require('ssh2-sftp-client');
const fs = require('fs');

const sftp = new Client();

async function testConnect() {
	console.log(
		fs.readFileSync('C:/Users/AG Dev BE/.ssh/id_ed25519_server', 'utf8'),
	);

	try {
		await sftp.connect({
			host: '193.180.215.67',
			port: 22,
			username: 'ubuntu',
			privateKey: fs.readFileSync(
				'C:/Users/AG Dev BE/.ssh/id_ed25519_server',
				// 'utf8',
			), // path private key
			// passphrase: 'your-passphrase', // nếu có
		});

		console.log('SFTP CONNECT SUCCESS');
	} catch (err) {
		console.error('SFTP CONNECT FAIL:', err.message);
	} finally {
		await sftp.end();
	}
}

testConnect();
