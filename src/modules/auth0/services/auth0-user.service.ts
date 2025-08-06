import { Injectable } from '@nestjs/common';
import { GetUsers200ResponseOneOfInner, UserCreate, UserUpdate } from 'auth0';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { User } from 'src/modules/user/entities/user.entity';
import { Auth0Service } from './auth0.service';

@Injectable()
export class Auth0UserService {
	constructor(
		private readonly auth0Service: Auth0Service,
		private readonly appConfigService: AppConfigService,
	) {}

	async getAllUsers(): Promise<GetUsers200ResponseOneOfInner[]> {
		const setting = await this.appConfigService.get();
		// Note: The maximum number of users you can get with this endpoint is 1000. For more, use users.exportUsers
		const management = await this.auth0Service.initAuth0ManagementClient();
		const allUsers: GetUsers200ResponseOneOfInner[] = [];
		let page = 0;
		while (true) {
			const {
				data: { users, total },
			} = await management.users.getAll({
				include_totals: true,
				page: page++,
				fields: 'user_id,name,email,nickname,phone_number,picture,date_of_birth,blocked,email_verified,last_login,last_ip,logins_count,user_metadata',
				q:
					'identities.connection:' +
					setting?.config?.auth0?.connectionName,
			});
			allUsers.push(...users);
			if (allUsers.length === total) {
				break;
			}
		}
		return allUsers;
	}

	// Auth0 does not allow updating email and phone number in the same request
	async update(auth0UserId: string, data: User) {
		const body: UserUpdate = {
			name: data.name,
			email: data.email,
			picture: data.avatar,
			blocked: !data.isActive,
			email_verified: data.emailVerified,
			user_metadata: {
				type: data.type,
				telegram_id: data.telegramId,
			},
		};

		const management = await this.auth0Service.initAuth0ManagementClient();
		return management.users.update({ id: auth0UserId }, body);
	}

	async updateUserPassword(auth0UserId: string, password: string) {
		const body: UserUpdate = {
			password,
		};
		const management = await this.auth0Service.initAuth0ManagementClient();
		return management.users.update({ id: auth0UserId }, body);
	}

	async updateUserPhoneNumber(auth0UserId: string, phoneNumber: string) {
		const body: UserUpdate = {
			phone_number: phoneNumber,
		};
		const management = await this.auth0Service.initAuth0ManagementClient();
		return management.users.update({ id: auth0UserId }, body);
	}

	async create(data: User, passwordPlainText: string) {
		const setting = await this.appConfigService.get();
		if (!setting) return;

		const body: UserCreate = {
			user_id: data.id,
			name: data.name,
			email: data.email,
			blocked: !data.isActive,
			email_verified: data.emailVerified,
			password: passwordPlainText,
			connection: setting.config.auth0?.connectionName || 'ag-release',
		};

		const user_metadata: any = {};
		if (data.telegramId) {
			user_metadata.telegram_id = data.telegramId;
		}
		if (Object.keys(user_metadata).length > 0) {
			body.user_metadata = user_metadata;
		}

		const management = await this.auth0Service.initAuth0ManagementClient();
		return management.users.create(body);
	}
}
