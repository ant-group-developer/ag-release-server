import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CiToolService {
	constructor(private readonly httpService: HttpService) {}

	async getTokenCi(): Promise<string> {
		const { data } = await firstValueFrom(
			this.httpService.post(
				`${process.env.CI_TOOL_URL}/api/openimp/token`,
				{},
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
					},
				},
			),
		);

		return data.token;
	}

	async sendFileExportToCi(file: {
		buffer: Buffer;
		originalname: string;
		mimetype: string;
	}) {
		const formData = new FormData();

		formData.append('file', file.buffer, {
			filename: file.originalname,
			contentType: file.mimetype,
		});

		const { data } = await firstValueFrom(
			this.httpService.post(
				`${process.env.CI_TOOL_URL}/api/export/trigger`,
				formData,
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
						...formData.getHeaders(),
					},
					maxBodyLength: Infinity,
					maxContentLength: Infinity,
				},
			),
		);

		return data;
	}

	async getExportJobStatus(jobId: string): Promise<string | null> {
		const { data } = await firstValueFrom(
			this.httpService.get(
				`${process.env.CI_TOOL_URL}/api/export/job/${jobId}`,
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
					},
				},
			),
		);

		const status = data?.job?.status ?? data?.status;

		return typeof status === 'string' ? status : null;
	}

	async triggerSpotifyProviderRefreshToken(): Promise<{
		success: boolean;
		jobId: string;
		message: string;
	}> {
		const { data } = await firstValueFrom(
			this.httpService.post(
				`${process.env.CI_TOOL_URL}/api/spotify/provider/refresh-token`,
				{},
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
						'Content-Type': 'application/json',
					},
				},
			),
		);
		return data;
	}

	async getSpotifyProviderRefreshStatus(jobId: string): Promise<{
		success: boolean;
		data: {
			status: 'running' | 'success' | 'failed';
			step: string;
			error: string | null;
			token?: {
				access_token: string;
				refresh_token: string;
				token_type: string;
				expires_in: number;
			};
			lastRun?: string;
		};
	}> {
		const { data } = await firstValueFrom(
			this.httpService.get(
				`${process.env.CI_TOOL_URL}/api/spotify/provider/refresh-status/${jobId}`,
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
					},
				},
			),
		);
		return data;
	}
}
