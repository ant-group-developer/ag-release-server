import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserReq } from 'src/common/interface/common.interface';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { UserChannel } from 'src/modules/channel/entities/user-channel.entity';
import { UserType } from 'src/modules/user/enum/user.enum';
import { Video } from 'src/modules/video/entities/video.entity';
import { ILike, Repository } from 'typeorm';

/**
 * `undefined` means unrestricted (platform admin). An empty array means the
 * current user may not see any video/channel analytics.
 */
export interface AnalyticsVideoScope {
	allowedChannelIds?: string[];
}

type ScopedAnalyticsInput = { analyticsVideoScope?: AnalyticsVideoScope };

export const getAnalyticsVideoScope = (
	input: object,
): AnalyticsVideoScope | undefined =>
	(input as ScopedAnalyticsInput).analyticsVideoScope;

/**
 * Keep audio analytics unchanged while restricting every video row to channels
 * explicitly assigned to a normal user.
 */
export const appendAnalyticsVideoScopeFilter = (
	filterSql: string,
	params: Record<string, unknown>,
	scope?: AnalyticsVideoScope,
	trackAlias = 't',
): string => {
	if (!scope || scope.allowedChannelIds === undefined) return filterSql;

	params.analyticsAllowedChannelIds = scope.allowedChannelIds;
	return `${filterSql} AND (${trackAlias}.release_type != 'video' OR ${trackAlias}.channel_id IN ({analyticsAllowedChannelIds:Array(String)}))`;
};

@Injectable()
export class AnalyticsVideoScopeService {
	constructor(
		@InjectRepository(UserChannel)
		private readonly userChannelRepo: Repository<UserChannel>,
		@InjectRepository(Video)
		private readonly videoRepo: Repository<Video>,
	) {}

	async resolve(user: UserReq): Promise<AnalyticsVideoScope> {
		if (user.type !== UserType.USER) return {};

		const rows = await this.userChannelRepo
			.createQueryBuilder('userChannel')
			.innerJoin(
				Channel,
				'channel',
				'channel.id = userChannel.channel_id',
			)
			.select('userChannel.channel_id', 'channelId')
			.where('userChannel.user_id = :userId', { userId: user.id })
			.andWhere('userChannel.tenant_id = :tenantId', {
				tenantId: user.tenantId,
			})
			.andWhere('channel.tenant_id = :tenantId', {
				tenantId: user.tenantId,
			})
			.andWhere('channel.is_active = :isActive', { isActive: true })
			.getRawMany<{ channelId: string }>();

		return { allowedChannelIds: rows.map((row) => row.channelId) };
	}

	assertChannelAccess(scope: AnalyticsVideoScope, channelId: string): void {
		if (
			scope.allowedChannelIds !== undefined &&
			!scope.allowedChannelIds.includes(channelId)
		) {
			throw new ForbiddenException(
				'You do not have analytics access to this channel',
			);
		}
	}

	async assertReleaseAccess(
		scope: AnalyticsVideoScope,
		releaseId: string,
	): Promise<void> {
		if (scope.allowedChannelIds === undefined) return;
		const video = await this.videoRepo.findOne({
			where: { releaseId },
			select: { channelId: true },
		});
		if (video) this.assertChannelAccess(scope, video.channelId ?? '');
	}

	async assertIsrcAccess(
		scope: AnalyticsVideoScope,
		isrc: string,
	): Promise<void> {
		if (scope.allowedChannelIds === undefined) return;
		const video = await this.videoRepo.findOne({
			where: { isrc: ILike(isrc) },
			select: { channelId: true },
		});
		if (video) this.assertChannelAccess(scope, video.channelId ?? '');
	}
}
