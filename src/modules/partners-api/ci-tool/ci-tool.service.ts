import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import {
	GetCiToolVevoJobResponse,
	QueueCiToolVevoReleasePayload,
	QueueCiToolVevoReleaseResponse,
	SearchCiToolVevoReleaseInput,
	SearchCiToolVevoReleaseResponse,
} from '../ci/interfaces/vevo-video.interface';

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

	async sendFileTakedownToCi(file: {
		buffer: Buffer;
		originalname: string;
		mimetype: string;
	}) {
		const formData = new FormData();

		formData.append('file', file.buffer, {
			filename: file.originalname,
			contentType: file.mimetype,
		});
		formData.append('action', 'post');

		const { data } = await firstValueFrom(
			this.httpService.post(
				`${process.env.CI_TOOL_URL}/api/takedown/trigger`,
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

	async searchVevoRelease(
		input: SearchCiToolVevoReleaseInput,
	): Promise<SearchCiToolVevoReleaseResponse> {
		const { data } = await firstValueFrom(
			this.httpService.post<SearchCiToolVevoReleaseResponse>(
				`${process.env.CI_TOOL_URL}/api/vevo/releases/search`,
				{
					isrc: input.isrc,
				},
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

	async getVevoVideoStatus(
		input: SearchCiToolVevoReleaseInput,
	): Promise<SearchCiToolVevoReleaseResponse> {
		const response = await this.searchVevoRelease({
			isrc: input.isrc,
		});

		if (!response.success) {
			throw new Error(
				response.message || 'CI Tool failed to search VEVO release',
			);
		}

		if (!response.found) {
			return {
				success: false,
				found: false,
				isrc: response.isrc || input.isrc,
				status: null,
				message: response.message || 'VEVO release not found',
			};
		}

		if (!response.status) {
			throw new Error(
				'CI Tool found VEVO release but returned no status',
			);
		}

		return {
			success: response.success,
			found: response.found,
			isrc: response.isrc,
			status: response.status,
			message: response.message,
		};
	}

	async queueFullVevoRelease(
		payload: QueueCiToolVevoReleasePayload,
	): Promise<QueueCiToolVevoReleaseResponse> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.post<QueueCiToolVevoReleaseResponse>(
					`${process.env.CI_TOOL_URL}/api/vevo/releases/full/queue`,
					payload,
					{
						headers: {
							'x-api-key': process.env.CI_TOOL_API_KEY,
							'Content-Type': 'application/json',
						},
					},
				),
			);

			if (!data?.jobId) {
				throw new Error('CI Tool did not return VEVO jobId');
			}

			return data;
		} catch (error: any) {
			const responseData = error.response?.data;
			console.error(
				'[CiToolService] queueFullVevoRelease 422 error response:',
				JSON.stringify(responseData, null, 2),
			);
			console.error(
				'[CiToolService] payload sent to CI Tool:',
				JSON.stringify(payload, null, 2),
			);

			if (responseData) {
				const details =
					typeof responseData === 'object'
						? JSON.stringify(responseData)
						: String(responseData);
				throw new Error(
					`CI Tool VEVO submit error (status ${error.response?.status}): ${details}`,
				);
			}
			throw error;
		}
	}

	async queueUpdateVevoRelease(
		payload: QueueCiToolVevoReleasePayload,
	): Promise<QueueCiToolVevoReleaseResponse> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.post<QueueCiToolVevoReleaseResponse>(
					`${process.env.CI_TOOL_URL}/api/vevo/releases/update/queue`,
					payload,
					{
						headers: {
							'x-api-key': process.env.CI_TOOL_API_KEY,
							'Content-Type': 'application/json',
						},
					},
				),
			);

			if (!data?.jobId) {
				throw new Error('CI Tool did not return VEVO update jobId');
			}

			return data;
		} catch (error: any) {
			const responseData = error.response?.data;

			console.error(
				'[CiToolService] queueUpdateVevoRelease error response:',
				JSON.stringify(responseData, null, 2),
			);

			if (responseData) {
				const details =
					typeof responseData === 'object'
						? JSON.stringify(responseData)
						: String(responseData);

				throw new Error(
					`CI Tool VEVO update error (status ${error.response?.status}): ${details}`,
				);
			}

			throw error;
		}
	}

	async getVevoReleaseJob(id: string): Promise<GetCiToolVevoJobResponse> {
		const { data } = await firstValueFrom(
			this.httpService.get<GetCiToolVevoJobResponse>(
				`${process.env.CI_TOOL_URL}/api/vevo/releases/jobs/${id}`,
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
