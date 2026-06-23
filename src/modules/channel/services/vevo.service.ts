import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import {
	VevoCreateChannelResponse,
	VevoGraphqlError,
} from '../interfaces/vevo.interface';

@Injectable()
export class VevoService {
	private readonly logger = new Logger(VevoService.name);

	constructor(
		private readonly httpService: HttpService,
		private readonly appConfigService: AppConfigService,
	) {}

	async newChannel(channelName: string): Promise<VevoCreateChannelResponse> {
		const config = this.appConfigService.getCache().config?.partners?.vevo;
		const token = config?.token;
		const callbackUrl = config?.callbackUrl;
		const baseUrl = config?.baseUrl || 'https://api.vevo.com/graphql';

		if (!token) {
			return {
				data: null,
				errors: [{ message: 'Vevo bearer token is not configured' }],
			};
		}

		if (!callbackUrl) {
			return {
				data: null,
				errors: [{ message: 'Vevo callback URL is not configured' }],
			};
		}

		const query = `mutation CreateChannel {
			createChannel(
				callbackUrl: ${JSON.stringify(callbackUrl)},
				channelName: ${JSON.stringify(channelName)}
			)
		}`;

		try {
			return await this.sendReqToVevo(baseUrl, token, query);
		} catch (error) {
			const axiosError = error as AxiosError<VevoCreateChannelResponse>;
			const responseData = axiosError.response?.data;

			if (responseData) return responseData;

			const errors: VevoGraphqlError[] = [
				{
					message: axiosError.message || 'Unable to reach Vevo API',
					extensions: axiosError.response?.status
						? { status: axiosError.response.status }
						: undefined,
				},
			];

			this.logger.error(
				`Failed to send Vevo channel request for ${channelName}: ${errors[0].message}`,
			);

			return {
				data: null,
				errors,
			};
		}
	}

	private async sendReqToVevo(
		baseUrl: string,
		token: string,
		query: string,
	): Promise<VevoCreateChannelResponse> {
		const { data } = await firstValueFrom(
			this.httpService.post<VevoCreateChannelResponse>(
				baseUrl,
				{ query },
				{
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
				},
			),
		);

		return data;
	}
}
