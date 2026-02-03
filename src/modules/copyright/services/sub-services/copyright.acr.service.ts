import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import FormData from 'form-data';
import { lastValueFrom } from 'rxjs';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { AppConfigKey } from 'src/modules/app-config/enums/app-config.enum';
import { AcrResponse, ResultScan } from '../../interface/copyright.interface';

@Injectable()
export class CopyrightAcrService implements OnModuleInit {
	private readonly logger = new Logger(CopyrightAcrService.name);

	private ACR_HOST: string;
	private ACR_ACCESS_KEY: string;
	private ACR_ACCESS_SECRET: string;
	private ENDPOINT = '/v1/identify';
	private SIGNATURE_VERSION = '1';
	private DATA_TYPE = 'audio';

	constructor(
		private readonly http: HttpService,
		private readonly appConfigService: AppConfigService,
	) {}

	onModuleInit() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.ACR_HOST = this.appConfigService.getValue(AppConfigKey.ACR_HOST);
		this.ACR_ACCESS_KEY = this.appConfigService.getValue(
			AppConfigKey.ACR_ACCESS_KEY,
		);
		this.ACR_ACCESS_SECRET = this.appConfigService.getValue(
			AppConfigKey.ACR_ACCESS_SECRET,
		);
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private sign({
		method,
		uri,
		accessKey,
		dataType,
		signatureVersion,
		timestamp,
		secret,
	}: {
		method: string;
		uri: string;
		accessKey: string;
		dataType: string;
		signatureVersion: string;
		timestamp: number;
		secret: string;
	}) {
		const stringToSign = [
			method,
			uri,
			accessKey,
			dataType,
			signatureVersion,
			timestamp,
		].join('\n');
		return crypto
			.createHmac('sha1', secret)
			.update(Buffer.from(stringToSign, 'utf-8'))
			.digest('base64');
	}

	private async recognizeByBuffer({
		buffer,
		key,
	}: {
		buffer: Buffer;
		key: { startSecond: number; endSecond: number };
	}): Promise<ResultScan> {
		const method = 'POST';
		const url = `${this.ACR_HOST}${this.ENDPOINT}`;
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = this.sign({
			method,
			uri: this.ENDPOINT,
			accessKey: this.ACR_ACCESS_KEY,
			dataType: this.DATA_TYPE,
			signatureVersion: this.SIGNATURE_VERSION,
			timestamp,
			secret: this.ACR_ACCESS_SECRET,
		});

		const form = new FormData();
		form.append('sample', buffer, { filename: `sample.wav` });
		form.append('sample_bytes', buffer.length);
		form.append('access_key', this.ACR_ACCESS_KEY);
		form.append('data_type', this.DATA_TYPE);
		form.append('signature_version', this.SIGNATURE_VERSION);
		form.append('signature', signature);
		form.append('timestamp', timestamp as any);
		const headers = form.getHeaders();

		const res$ = this.http.post<AcrResponse>(url, form, {
			headers,
			maxBodyLength: Infinity,
			maxContentLength: Infinity,
			timeout: 20000,
		});
		const { data } = await lastValueFrom(res$);
		return { key, content: data.metadata ?? null };
	}

	private sliceWavSegment(
		wavBuffer: Buffer,
		startSec: number,
		lenSec: number,
	): Buffer {
		if (
			wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
			wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
		) {
			throw new Error('Invalid WAV: missing RIFF/WAVE');
		}

		let offset = 12;
		let fmtFound = false;
		let dataFound = false;

		let audioFormat = 1;
		let numChannels = 2;
		let sampleRate = 44100;
		let bitsPerSample = 16;

		let dataStart = -1;
		let dataSize = 0;

		while (offset + 8 <= wavBuffer.length) {
			const id = wavBuffer.toString('ascii', offset, offset + 4);
			const size = wavBuffer.readUInt32LE(offset + 4);
			const next = offset + 8 + size;

			if (id === 'fmt ') {
				const fmtStart = offset + 8;
				audioFormat = wavBuffer.readUInt16LE(fmtStart + 0);
				numChannels = wavBuffer.readUInt16LE(fmtStart + 2);
				sampleRate = wavBuffer.readUInt32LE(fmtStart + 4);
				bitsPerSample = wavBuffer.readUInt16LE(fmtStart + 14);
				fmtFound = true;
			} else if (id === 'data') {
				dataStart = offset + 8;
				dataSize = size;
				dataFound = true;
				break;
			}

			offset = next;
		}

		if (!fmtFound) throw new Error('Invalid WAV: no fmt chunk found');
		if (!dataFound) throw new Error('Invalid WAV: no data chunk found');

		const bytesPerSample = bitsPerSample / 8;
		const blockAlign = numChannels * bytesPerSample;
		const byteRate = sampleRate * blockAlign;

		const dataEnd = dataStart + dataSize;
		const startByte = Math.max(
			dataStart,
			Math.min(dataStart + Math.floor(startSec * byteRate), dataEnd),
		);
		const endByte = Math.max(
			startByte,
			Math.min(startByte + Math.floor(lenSec * byteRate), dataEnd),
		);
		const pcmData = wavBuffer.subarray(startByte, endByte);

		const HEADER_SIZE = 44;
		const subchunk1Size = 16;
		const subchunk2Size = pcmData.length;
		const chunkSize = 36 + subchunk2Size;

		const out = Buffer.alloc(HEADER_SIZE + subchunk2Size);

		out.write('RIFF', 0, 4, 'ascii');
		out.writeUInt32LE(chunkSize, 4);
		out.write('WAVE', 8, 4, 'ascii');

		out.write('fmt ', 12, 4, 'ascii');
		out.writeUInt32LE(subchunk1Size, 16);
		out.writeUInt16LE(audioFormat, 20);
		out.writeUInt16LE(numChannels, 22);
		out.writeUInt32LE(sampleRate, 24);
		out.writeUInt32LE(byteRate, 28);
		out.writeUInt16LE(blockAlign, 32);
		out.writeUInt16LE(bitsPerSample, 34);

		out.write('data', 36, 4, 'ascii');
		out.writeUInt32LE(subchunk2Size, 40);

		pcmData.copy(out, HEADER_SIZE);

		return out;
	}

	private getChunks({
		buffer,
		duration,
		windowSec,
	}: {
		buffer: Buffer;
		duration: number;
		windowSec: number;
	}) {
		const chunks: {
			buffer: Buffer;
			key: {
				startSecond: number;
				endSecond: number;
			};
		}[] = [];

		for (let startSec = 0; startSec < duration; startSec += windowSec) {
			const lenSec = Math.min(windowSec, duration - startSec);
			chunks.push({
				key: {
					startSecond: startSec,
					endSecond: startSec + lenSec,
				},
				buffer: this.sliceWavSegment(buffer, startSec, lenSec),
			});
		}

		return chunks;
	}

	// public
	async scanBuffer({
		buffer,
		duration,
		chunkDuration,
	}: {
		buffer: Buffer;
		duration: number;
		chunkDuration: number;
	}): Promise<ResultScan[]> {
		const chunks = this.getChunks({
			buffer,
			duration,
			windowSec: chunkDuration,
		});

		const tasks = chunks.map(({ buffer, key }) =>
			this.recognizeByBuffer({ buffer, key }).catch((e) => {
				this.logger.error(e);
				return null;
			}),
		);

		const results = await Promise.all(tasks);

		return results.filter((r): r is ResultScan => r !== null);
	}
}
