import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';

import { nanoid } from 'nanoid';
import { ResponseError } from 'src/common/dtos/common.response.dto';

import { Response } from 'express';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import { mapKeys, snakeCase } from 'lodash';

export function getCoverArtThumbnails(
	coverArts: ReleaseCoverArt[] | undefined,
): ICoverArtThumbnails {
	const result: ICoverArtThumbnails = {
		'75x75': null,
		'100x100': null,
		'160x160': null,
		'300x300': null,
		original: null,
	};

	if (!coverArts) return result;

	for (const { type, fileId } of coverArts) {
		if (
			['75x75', '100x100', '160x160', '300x300', 'original'].includes(
				type,
			)
		) {
			result[type as keyof ICoverArtThumbnails] = fileId ?? null;
		}
	}

	return result;
}

export function generateId(length: number = 10) {
	return nanoid(length);
}

export function ensureUUID(id: string) {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			id,
		)
	) {
		throw new ResponseError({ message: 'Invalid UUID' });
	}
}

export function renderTemplate(
	filePath: string,
	data: Record<string, any>,
): string {
	// const filePath = path.join(__dirname, '..', 'templates', templateName);
	const templateSource = fs.readFileSync(filePath, 'utf8');
	const template = Handlebars.compile(templateSource);
	return template(data);
}

export function stringToCode(input: string): string {
	return input
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ /g, '_')
		.toUpperCase();
}

export function splitCodeIndex(code: string): {
	preCode: string;
	index: number;
} {
	const match = code.match(/^(.*)_(\d+)$/);

	if (match) {
		return {
			preCode: match[1],
			index: parseInt(match[2], 10),
		};
	}

	return {
		preCode: code,
		index: 0,
	};
}

export function normalizeName(name: string): string {
	return name
		.normalize('NFD') // tách dấu
		.replace(/[\u0300-\u036f]/g, '') // xóa dấu
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toUpperCase()
		.trim()
		.replace(/\s+/g, '_'); // khoảng trắng thành _
}

export function streamDownload(
	res: Response,
	options: {
		stream: NodeJS.ReadableStream;
		contentType: string;
		fileName: string;
	},
) {
	res.setHeader('Content-Type', options.contentType);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename="${options.fileName}"`,
	);

	options.stream.pipe(res);
}

export function toSnakeCaseKeys<T extends object>(obj: T): Record<string, any> {
	return mapKeys(obj, (_value, key) => snakeCase(key));
}

export function pickFields<T extends Record<string, string>, K extends keyof T>(
	fields: T,
	keys: readonly K[],
): Pick<T, K> {
	const result = {} as Pick<T, K>;
	keys.forEach((k) => {
		result[k] = fields[k];
	});
	return result;
}

// input 1 -> 100
export const randomFail = (percent: number = 0) => {
	if (Math.random() < percent / 100) {
		throw new Error('RANDOM_FAIL');
	}
	return true;
};

export const handleTenantId = (
	tenantId: string | undefined,
): string | undefined => {
	return tenantId === 'system-tenant' ? undefined : tenantId;
};

// image
import sharp from 'sharp';
export async function resizeCoverImageTo3000x3000({
	buffer,
}: {
	buffer: Buffer;
}): Promise<sharp.Sharp> {
	const img = sharp(buffer);
	const meta = await img.metadata();

	const width = meta.width ?? 0;
	const height = meta.height ?? 0;

	if (width >= 3000 && height >= 3000) {
		return img;
	}

	return img.resize(3000, 3000, { fit: 'cover' });
}

export function resizeCoverImage({
	buffer,
	output,
}: {
	buffer: Buffer;
	extension?: string;
	output: {
		width: number;
		height: number;
	};
}) {
	const img = sharp(buffer);

	return img.resize(output.width, output.height, { fit: 'cover' });
}

export async function removeFolder(path: string) {
	// return;
	await fs.promises.rm(path, {
		recursive: true,
		force: true,
	});
}

export function genBatchId(): string {
	const d = new Date();

	const pad = (n: number, l = 2) => n.toString().padStart(l, '0');

	return (
		d.getFullYear().toString() +
		pad(d.getMonth() + 1) +
		pad(d.getDate()) +
		pad(d.getHours()) +
		pad(d.getMinutes()) +
		pad(d.getSeconds()) +
		pad(d.getMilliseconds(), 3)
	);
}

import archiver from 'archiver';
export function zipFolder(sourceDir: string, zipPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(zipPath);
		const archive = archiver('zip', { zlib: { level: 9 } });

		output.on('close', () => resolve());
		archive.on('error', (err) => reject(err));

		archive.pipe(output);
		archive.directory(sourceDir, false);
		archive.finalize();
	});
}

import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { ValueTransformer } from 'typeorm';

export async function uploadFileToSftp({
	sftp,
	localDir = '',
	remoteDir = '',
	remoteFileName,
}: {
	sftp: {
		host: string;
		port?: number;
		username: string;
		password?: string;
		privateKey?: string | Buffer;
	};
	localDir?: string;
	remoteDir?: string;
	remoteFileName?: string;
}): Promise<{ remotePath: string }> {
	const client = new SftpClient();

	try {
		// if (!fs.statSync(localDir).isFile()) {
		// 	throw new Error('localDir is not a file');
		// }

		await client.connect({
			host: sftp.host,
			port: sftp.port ?? 22,
			username: sftp.username,
			password: sftp.password,
			privateKey: sftp.privateKey,
			// keepaliveInterval: 10_000,
			// keepaliveCountMax: 5,
		});

		// mkdir -p
		await client.mkdir(remoteDir, true);

		const fileName = remoteFileName ?? path.basename(localDir);
		const remotePath = path.posix.join(remoteDir, fileName);

		// FAST MODE (gần FileZilla nhất)
		await client.put(localDir, remotePath, {
			concurrency: 2,
			chunkSize: 128 * 1024,
		});

		return { remotePath };
	} finally {
		await client.end();
	}
}

export const MediaUrlTransformer: ValueTransformer = {
	to: (value: string) => {
		// GHI XUỐNG DB: Bóc Base Domain ra (nếu có), chỉ lưu "my-bucket/pic.jpg"
		if (!value) return value;
		const domain = process.env.R2_PUBLIC_BASE_URL || '';
		return value.replace(`${domain}/`, '');
	},
	from: (value: string) => {
		// ĐỌC LÊN TỪ DB: Tự động ghép Base Domain vào
		if (!value) return value;
		const domain = process.env.R2_PUBLIC_BASE_URL || 'default.com';
		return value.startsWith('http') ? value : `${domain}/${value}`;
	},
};
