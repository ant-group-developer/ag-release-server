import { HttpService } from '@nestjs/axios';
import {
	BadGatewayException,
	BadRequestException,
	HttpException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { CreateVevoChannelDto } from '../dtos/vevo.dto';
import { VevoCreateChannelResponse } from '../interfaces/vevo.interface';

@Injectable()
export class VevoService {
	private readonly logger = new Logger(VevoService.name);

	constructor(
		private readonly httpService: HttpService,
		private readonly appConfigService: AppConfigService,
	) {}

	async createChannel(payload: CreateVevoChannelDto) {
		const config = this.appConfigService.getCache().config?.partners?.vevo;
		const token = config?.token;
		const callbackUrl = payload.callbackUrl || config?.callbackUrl;
		const baseUrl = config?.baseUrl || 'https://api.vevo.com/graphql';

		if (!token) {
			throw new BadRequestException(
				'Vevo bearer token is not configured',
			);
		}

		if (!callbackUrl) {
			throw new BadRequestException(
				'Vevo callback URL is not configured',
			);
		}

		const query = `mutation CreateChannel {
			createChannel(
				callbackUrl: ${JSON.stringify(callbackUrl)},
				channelName: ${JSON.stringify(payload.channelName)}
			)
		}`;

		try {
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

			if (data.errors?.length) {
				throw new BadRequestException(
					data.errors[0].extensions?.message ||
						data.errors[0].message,
				);
			}

			return data;
		} catch (error) {
			if (error instanceof HttpException) throw error;

			const axiosError = error as AxiosError;

			this.logger.error(
				`Failed to create Vevo channel ${payload.channelName}: ${axiosError.message}`,
			);

			if (axiosError.response) {
				throw new HttpException(
					axiosError.response.data ?? axiosError.message,
					axiosError.response.status,
				);
			}

			throw new BadGatewayException('Unable to reach Vevo API');
		}
	}
}
