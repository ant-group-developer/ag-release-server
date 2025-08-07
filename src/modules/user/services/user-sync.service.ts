/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { GetUsers200ResponseOneOfInner } from 'auth0';
import schedule from 'node-schedule';
import { DEFAULT_TIME_SYNC } from 'src/common/constants/common.default.constants';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { Auth0UserService } from 'src/modules/auth0/services/auth0-user.service';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserSyncService {
	private readonly logger = new Logger(UserSyncService.name);
	private currentJob: schedule.Job | null = null;

	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly auth0UserService: Auth0UserService,
		private readonly appConfigService: AppConfigService,
	) {
		this.scheduleTask();
	}

	@OnEvent(AppEvent.CHANGE_TIME_SYNC_DATA)
	private async scheduleTask(newTime?: string): Promise<void> {
		let timeUpdateData = newTime;
		const data = await this.appConfigService.get();

		if (!timeUpdateData) {
			timeUpdateData =
				data?.config?.auth0?.timeSyncData ?? DEFAULT_TIME_SYNC;
		}

		const [hour, minute, second = '00'] = timeUpdateData
			.split(':')
			.map((x) => parseInt(x));

		if (this.currentJob) {
			this.currentJob.cancel(); // Hủy job cũ nếu có
		}

		this.currentJob = schedule.scheduleJob({ hour, minute, second }, () =>
			this.syncUserFromAuth0(),
		);

		this.logger.log(`Rescheduled task for ${timeUpdateData}`);
	}

	async syncUserFromAuth0() {
		const userServerList = await this.userRepository.find();
		const userAuth0List = await this.auth0UserService.getAllUsers();

		// Map userId của user Auth0 để lookup nhanh (user_id: "auth0|xxxx")
		const auth0UserIdSet = new Set<string>();
		const auth0UserMap = new Map<string, GetUsers200ResponseOneOfInner>();
		userAuth0List.forEach((u) => {
			if (u.user_id) {
				auth0UserIdSet.add(u.user_id);
				auth0UserMap.set(u.user_id, u);
			}
		});

		// Map userId của user DB để lookup nhanh (giả sử userEntity.id là uuid)
		const userServerMap = new Map<string, User>();
		userServerList.forEach((u) => {
			if (u.auth0UserId) userServerMap.set(u.auth0UserId, u);
		});

		const usersToUpdate: User[] = [];
		const usersToCreate: User[] = [];

		// 1. Xử lý user tồn tại trong Auth0 (update hoặc tạo mới)
		for (const [auth0UserId, auth0User] of auth0UserMap.entries()) {
			let userEntity = userServerMap.get(auth0UserId);

			if (userEntity) {
				let updated = false;

				if (userEntity.auth0UserId !== auth0User.user_id) {
					userEntity.auth0UserId = auth0User.user_id;
					updated = true;
				}
				if (userEntity.email !== auth0User.email) {
					userEntity.email = auth0User.email;
					updated = true;
				}
				if (auth0User.name && userEntity.name !== auth0User.name) {
					userEntity.name = auth0User.name;
					updated = true;
				}
				if (
					auth0User.picture &&
					userEntity.avatar !== auth0User.picture
				) {
					userEntity.avatar = auth0User.picture;
					updated = true;
				}
				if (
					typeof auth0User.email_verified === 'boolean' &&
					userEntity.emailVerified !== auth0User.email_verified
				) {
					userEntity.emailVerified = auth0User.email_verified;
					updated = true;
				}
				const newTelegramId = auth0User.user_metadata?.telegram_id;
				if (
					newTelegramId !== undefined &&
					userEntity.telegramId !== newTelegramId
				) {
					userEntity.telegramId = newTelegramId;
					updated = true;
				}
				const newIsActive = !auth0User.blocked;
				if (userEntity.isActive !== newIsActive) {
					userEntity.isActive = newIsActive;
					updated = true;
				}
				if (
					auth0User.last_login &&
					(!userEntity.lastLogin ||
						userEntity.lastLogin.toISOString() !==
							new Date(
								auth0User.last_login as string,
							).toISOString())
				) {
					userEntity.lastLogin = new Date(
						auth0User.last_login as string,
					);
					updated = true;
				}
				if (
					auth0User.last_ip &&
					userEntity.lastIp !== auth0User.last_ip
				) {
					userEntity.lastIp = auth0User.last_ip;
					updated = true;
				}
				if (userEntity.loginsCount !== auth0User.logins_count) {
					userEntity.loginsCount = auth0User.logins_count;
					updated = true;
				}

				if (updated) {
					usersToUpdate.push(userEntity);
				}
			} else {
				// Tạo mới user
				userEntity = this.userRepository.create({
					auth0UserId: auth0User.user_id,
					name: auth0User.name || auth0User.nickname || 'Unknown',
					email: auth0User.email,
					avatar: auth0User.picture,
					emailVerified: !!auth0User.email_verified,
					telegramId: auth0User.user_metadata?.telegram_id || null,
					isActive: !auth0User.blocked,
					lastLogin:
						(auth0User.last_login &&
							new Date(auth0User.last_login as string)) ||
						undefined,
					lastIp: auth0User.last_ip || undefined,
					loginsCount: auth0User.logins_count,
				});
				usersToCreate.push(userEntity);
			}
		}

		// 2. Vô hiệu hóa user trong DB không còn trong Auth0
		for (const [auth0UserId, userEntity] of userServerMap) {
			if (!auth0UserIdSet.has(auth0UserId) && userEntity.isActive) {
				userEntity.isActive = false;
				usersToUpdate.push(userEntity);
			}
		}

		// Bulk save for better performance
		if (usersToUpdate.length > 0) {
			await this.userRepository.save(usersToUpdate);
		}
		if (usersToCreate.length > 0) {
			await this.userRepository.save(usersToCreate);
		}

		this.logger.log('User sync from Auth0 completed successfully.');
	}
}
