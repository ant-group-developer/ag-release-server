import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AuthenticationClient, ManagementClient } from 'auth0';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { Auth0TokenResponse } from '../auth0.interface';

@Injectable()
export class Auth0Service {
	constructor(private readonly appConfigService: AppConfigService) {}

	private async getAuth0Config() {
		const setting = await this.appConfigService.get();
		if (!setting?.config?.auth0) {
			throw new InternalServerErrorException(
				'Please config auth0 setting first',
			);
		}
		return setting.config.auth0;
	}

	async initAuth0ManagementClient() {
		const auth0Config = await this.getAuth0Config();
		const management = new ManagementClient({
			domain: auth0Config.domain,
			clientId: auth0Config.clientId,
			clientSecret: auth0Config.clientSecret,
		});
		return management;
	}

	async initAuth0AuthenticationClient() {
		const auth0Config = await this.getAuth0Config();
		const auth = new AuthenticationClient({
			domain: auth0Config.domain,
			clientId: auth0Config.clientId,
			clientSecret: auth0Config.clientSecret,
		});
		return auth;
	}

	async getTokenFromAuth0Server(): Promise<Auth0TokenResponse | null> {
		const auth0Config = await this.getAuth0Config();
		try {
			const response = await fetch(
				`https://${auth0Config.domain}/oauth/token`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						client_id: auth0Config.clientId,
						client_secret: auth0Config.clientSecret,
						audience: auth0Config.audience,
						grant_type: 'client_credentials',
					}),
				},
			);

			if (!response.ok) {
				throw new Error('Network response was not ok');
			}

			const data = await response.json();
			return data;
		} catch (error) {
			console.error('Error fetching token:', error);
			throw new InternalServerErrorException(error);
		}
	}

	async getToken() {
		const auth = await this.initAuth0AuthenticationClient();
		const auth0Config = await this.getAuth0Config();
		const { data: token } = await auth.oauth.clientCredentialsGrant({
			audience: auth0Config.audience,
		});
		return token;
	}
}
