import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { DataSource, Repository } from 'typeorm';
import {
	QueryYoutubeChannelSyncLogsDto,
	SyncYoutubeChannelsDto,
} from '../dto/youtube-channel-sync.dto';
import { YoutubeChannelSyncLog } from '../entities/youtube-channel-sync-log.entity';
import {
	YoutubeApiClientService,
	YoutubeChannelSnippet,
} from './youtube-api-client.service';

type FieldChange = {
	fieldName: 'name' | 'thumb_url';
	previousValue: string | null;
	nextValue: string;
};

type SyncSummary = {
	force: boolean;
	totalChannels: number;
	processedChannels: number;
	updatedChannels: number;
	updatedFields: number;
	noChangeChannels: number;
	missingYoutubeChannelId: number;
	notFoundOnYoutube: number;
	failedChannels: number;
	errors: Array<{ youtubeChannelId: string; message: string }>;
};

@Injectable()
export class YoutubeChannelSyncService {
	private readonly logger = new Logger(YoutubeChannelSyncService.name);

	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		@InjectRepository(YoutubeChannelSyncLog)
		private readonly logRepo: Repository<YoutubeChannelSyncLog>,
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly youtubeApiClient: YoutubeApiClientService,
	) {}

	/**
	 * Synchronise every local channel in the request lifecycle. Google calls are
	 * internally batched by 50 IDs, but this remains one API call for the admin.
	 */
	async syncAll(
		dto: SyncYoutubeChannelsDto,
		actorId: string,
	): Promise<SyncSummary> {
		const channels = await this.channelRepo.find({ order: { id: 'ASC' } });
		const summary: SyncSummary = {
			force: dto.force,
			totalChannels: channels.length,
			processedChannels: 0,
			updatedChannels: 0,
			updatedFields: 0,
			noChangeChannels: 0,
			missingYoutubeChannelId: 0,
			notFoundOnYoutube: 0,
			failedChannels: 0,
			errors: [],
		};

		const byYoutubeId = new Map<string, Channel[]>();
		for (const channel of channels) {
			const youtubeChannelId = channel.youtubeChannelId?.trim();
			if (!youtubeChannelId) {
				summary.missingYoutubeChannelId++;
				continue;
			}
			const group = byYoutubeId.get(youtubeChannelId) ?? [];
			group.push(channel);
			byYoutubeId.set(youtubeChannelId, group);
		}

		const ids = [...byYoutubeId.keys()];
		for (let index = 0; index < ids.length; index += 50) {
			const batchIds = ids.slice(index, index + 50);
			try {
				const remoteChannels =
					await this.youtubeApiClient.getChannelsById(batchIds);
				for (const youtubeChannelId of batchIds) {
					const remote = remoteChannels.get(youtubeChannelId);
					const localChannels =
						byYoutubeId.get(youtubeChannelId) ?? [];
					if (!remote) {
						summary.notFoundOnYoutube += localChannels.length;
						continue;
					}
					for (const channel of localChannels) {
						try {
							const result = await this.applyRemoteMetadata(
								channel.id,
								remote,
								dto.force,
								actorId,
							);
							summary.processedChannels++;
							if (result.changedFields > 0) {
								summary.updatedChannels++;
								summary.updatedFields += result.changedFields;
							} else {
								summary.noChangeChannels++;
							}
							if (result.warning) {
								summary.errors.push({
									youtubeChannelId,
									message: result.warning,
								});
							}
						} catch (error: any) {
							summary.failedChannels++;
							summary.errors.push({
								youtubeChannelId,
								message: error.message,
							});
						}
					}
				}
			} catch (error: any) {
				this.logger.error(
					`YouTube channel batch ${index / 50 + 1} failed: ${error.message}`,
				);
				summary.failedChannels += batchIds.reduce(
					(total, id) => total + (byYoutubeId.get(id)?.length ?? 0),
					0,
				);
				for (const youtubeChannelId of batchIds) {
					summary.errors.push({
						youtubeChannelId,
						message: error.message,
					});
				}
			}
		}

		return summary;
	}

	async listLogs(
		query: QueryYoutubeChannelSyncLogsDto,
	): Promise<PageDto<YoutubeChannelSyncLog>> {
		const qb = this.logRepo.createQueryBuilder('log');
		if (query.channelId) {
			qb.where('log.channelId = :channelId', {
				channelId: query.channelId,
			});
		}
		qb.orderBy('log.createdAt', 'DESC').skip(query.skip).take(query.limit);
		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	private async applyRemoteMetadata(
		channelId: string,
		remote: YoutubeChannelSnippet,
		force: boolean,
		actorId: string,
	): Promise<{ changedFields: number; warning?: string }> {
		return this.dataSource.transaction(async (manager) => {
			const channel = await manager
				.getRepository(Channel)
				.createQueryBuilder('channel')
				.setLock('pessimistic_write')
				.where('channel.id = :channelId', { channelId })
				.getOne();
			if (!channel)
				return {
					changedFields: 0,
					warning: 'Channel no longer exists',
				};

			const changes: FieldChange[] = [];
			const remoteName = remote.title.trim();
			if (
				remoteName &&
				remoteName.length <= 200 &&
				this.shouldUpdate(channel.name, remoteName, force)
			) {
				const duplicate = await manager
					.getRepository(Channel)
					.createQueryBuilder('existing')
					.where('existing.name = :name', { name: remoteName })
					.andWhere('existing.id != :channelId', {
						channelId: channel.id,
					})
					.getExists();
				if (!duplicate) {
					changes.push({
						fieldName: 'name',
						previousValue: channel.name,
						nextValue: remoteName,
					});
				}
			}

			const remoteThumbUrl = this.normalizeThumbnailUrl(
				remote.thumbnailUrl,
			);
			if (
				remoteThumbUrl &&
				this.shouldUpdate(channel.thumbUrl, remoteThumbUrl, force)
			) {
				changes.push({
					fieldName: 'thumb_url',
					previousValue: channel.thumbUrl,
					nextValue: remoteThumbUrl,
				});
			}

			if (!changes.length) return { changedFields: 0 };
			for (const change of changes) {
				if (change.fieldName === 'name')
					channel.name = change.nextValue;
				else channel.thumbUrl = change.nextValue;
			}
			await manager.save(channel);
			await manager.save(
				YoutubeChannelSyncLog,
				changes.map((change) =>
					manager.create(YoutubeChannelSyncLog, {
						channelId: channel.id,
						youtubeChannelId: remote.channelId,
						actorId,
						force,
						...change,
					}),
				),
			);
			return { changedFields: changes.length };
		});
	}

	private shouldUpdate(
		currentValue: string | null,
		nextValue: string,
		force: boolean,
	): boolean {
		if (force) return currentValue !== nextValue;
		return currentValue === null;
	}

	private normalizeThumbnailUrl(value: string | null): string | null {
		if (!value || value.length > 500) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' ? url.toString() : null;
		} catch {
			return null;
		}
	}
}
