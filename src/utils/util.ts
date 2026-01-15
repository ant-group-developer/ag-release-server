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
