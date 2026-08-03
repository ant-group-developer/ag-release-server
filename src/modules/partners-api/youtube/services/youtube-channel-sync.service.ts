import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { ChannelHistory } from 'src/modules/channel/entities/channel-history.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { DataSource, Repository } from 'typeorm';
import {
	ApproveYoutubeChannelSyncItemsDto,
	QueryYoutubeChannelSyncItemsDto,
	RejectYoutubeChannelSyncItemDto,
} from '../dto/youtube-channel-sync.dto';
import { YoutubeChannelSyncItem } from '../entities/youtube-channel-sync-item.entity';
import { YoutubeChannelSyncRun } from '../entities/youtube-channel-sync-run.entity';
import {
	YoutubeChannelSyncResult,
	YoutubeChannelSyncReviewStatus,
	YoutubeChannelSyncRunStatus,
} from '../enum/youtube-channel-sync.enum';
import {
	YoutubeApiClientService,
	YoutubeChannelSnippet,
} from './youtube-api-client.service';
import { NoAvailableYoutubeKeyError } from './youtube-api-key-pool.service';

type SyncCounts = {
	processedChannels: number;
	changeDetectedCount: number;
	noChangeCount: number;
	missingYoutubeChannelIdCount: number;
	notFoundCount: number;
	failedCount: number;
};

@Injectable()
export class YoutubeChannelSyncService {
	private readonly logger = new Logger(YoutubeChannelSyncService.name);

	constructor(
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
		@InjectRepository(ChannelHistory)
		private readonly channelHistoryRepo: Repository<ChannelHistory>,
		@InjectRepository(YoutubeChannelSyncRun)
		private readonly runRepo: Repository<YoutubeChannelSyncRun>,
		@InjectRepository(YoutubeChannelSyncItem)
		private readonly itemRepo: Repository<YoutubeChannelSyncItem>,
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly youtubeApiClient: YoutubeApiClientService,
	) {}

	/** Creates a durable run first. The scan itself never mutates channels. */
	async startRun(requestedBy: string): Promise<YoutubeChannelSyncRun> {
		const active = await this.runRepo.findOne({
			where: [
				{ status: YoutubeChannelSyncRunStatus.PENDING },
				{ status: YoutubeChannelSyncRunStatus.RUNNING },
			],
		});
		if (active) {
			throw new ConflictException(
				`YouTube channel sync ${active.id} is already ${active.status.toLowerCase()}`,
			);
		}

		const run = await this.runRepo.save(
			this.runRepo.create({
				requestedBy,
				status: YoutubeChannelSyncRunStatus.PENDING,
			}),
		);

		void this.processRun(run.id);
		return run;
	}

	async findRun(id: string): Promise<YoutubeChannelSyncRun> {
		const run = await this.runRepo.findOne({ where: { id } });
		if (!run)
			throw new NotFoundException(
				`YouTube channel sync run ${id} not found`,
			);
		return run;
	}

	async listRuns(limit = 20): Promise<YoutubeChannelSyncRun[]> {
		return this.runRepo.find({
			order: { createdAt: 'DESC' },
			take: Math.min(Math.max(limit, 1), 100),
		});
	}

	async listItems(
		runId: string,
		query: QueryYoutubeChannelSyncItemsDto,
	): Promise<PageDto<YoutubeChannelSyncItem>> {
		await this.findRun(runId);
		const qb = this.itemRepo
			.createQueryBuilder('item')
			.leftJoinAndSelect('item.channel', 'channel')
			.where('item.syncRunId = :runId', { runId });

		if (query.syncResult) {
			qb.andWhere('item.syncResult = :syncResult', {
				syncResult: query.syncResult,
			});
		}
		if (query.reviewStatus) {
			qb.andWhere('item.reviewStatus = :reviewStatus', {
				reviewStatus: query.reviewStatus,
			});
		}
		if (query.keyword) {
			qb.andWhere(
				'(item.currentName ILIKE :keyword OR item.proposedName ILIKE :keyword OR item.youtubeChannelId ILIKE :keyword)',
				{ keyword: `%${query.keyword}%` },
			);
		}

		qb.orderBy('item.createdAt', 'ASC').skip(query.skip).take(query.limit);
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

	async approveItem(itemId: string, reviewerId: string) {
		return this.dataSource.transaction(async (manager) => {
			const item = await manager
				.getRepository(YoutubeChannelSyncItem)
				.createQueryBuilder('item')
				.setLock('pessimistic_write')
				.where('item.id = :itemId', { itemId })
				.getOne();
			if (!item)
				throw new NotFoundException(
					`YouTube channel sync item ${itemId} not found`,
				);

			if (item.reviewStatus === YoutubeChannelSyncReviewStatus.APPROVED) {
				return { item, applied: false, stale: false };
			}
			if (
				item.syncResult !== YoutubeChannelSyncResult.CHANGE_DETECTED ||
				item.reviewStatus !== YoutubeChannelSyncReviewStatus.PENDING ||
				!item.channelId
			) {
				throw new BadRequestException(
					'Only a pending changed item can be approved',
				);
			}

			const channel = await manager
				.getRepository(Channel)
				.createQueryBuilder('channel')
				.setLock('pessimistic_write')
				.where('channel.id = :channelId', { channelId: item.channelId })
				.getOne();
			if (!channel) {
				item.reviewStatus = YoutubeChannelSyncReviewStatus.STALE;
				item.note = 'Channel was deleted after the sync scan';
				item.reviewedBy = reviewerId;
				item.reviewedAt = new Date();
				await manager.save(item);
				return { item, applied: false, stale: true };
			}

			if (
				channel.updatedAt.getTime() !==
					item.channelUpdatedAtSnapshot.getTime() ||
				channel.name !== item.currentName ||
				(channel.thumbUrl ?? null) !== item.currentThumbUrl
			) {
				item.reviewStatus = YoutubeChannelSyncReviewStatus.STALE;
				item.note =
					'Channel changed after the sync scan. Create a new sync run to refresh the proposal.';
				item.reviewedBy = reviewerId;
				item.reviewedAt = new Date();
				await manager.save(item);
				return { item, applied: false, stale: true };
			}

			if (
				item.changedFields.includes('name') &&
				item.proposedName &&
				item.proposedName !== channel.name
			) {
				const duplicate = await manager
					.getRepository(Channel)
					.createQueryBuilder('channel')
					.where('channel.name = :name', { name: item.proposedName })
					.andWhere('channel.id != :channelId', {
						channelId: channel.id,
					})
					.getExists();
				if (duplicate) {
					throw new ConflictException(
						`Cannot apply name '${item.proposedName}' because another channel already uses it`,
					);
				}
			}

			await manager.save(
				ChannelHistory,
				this.channelHistoryRepo.create({
					userId: reviewerId,
					channelId: channel.id,
					channel,
				}),
			);

			if (item.changedFields.includes('name') && item.proposedName) {
				channel.name = item.proposedName;
			}
			if (item.changedFields.includes('thumbUrl')) {
				channel.thumbUrl = item.proposedThumbUrl;
			}
			await manager.save(channel);

			item.reviewStatus = YoutubeChannelSyncReviewStatus.APPROVED;
			item.reviewedBy = reviewerId;
			item.reviewedAt = new Date();
			item.appliedAt = new Date();
			await manager.save(item);
			return { item, applied: true, stale: false };
		});
	}

	async approveItems(
		dto: ApproveYoutubeChannelSyncItemsDto,
		reviewerId: string,
	) {
		const results: Array<{
			itemId: string;
			applied: boolean;
			stale: boolean;
			error?: string;
		}> = [];
		for (const itemId of [...new Set(dto.itemIds)]) {
			try {
				const result = await this.approveItem(itemId, reviewerId);
				results.push({
					itemId,
					applied: result.applied,
					stale: result.stale,
				});
			} catch (error: any) {
				results.push({
					itemId,
					applied: false,
					stale: false,
					error: error.message,
				});
			}
		}
		return results;
	}

	/** Apply every pending proposed change in one sync run. Each item remains an
	 * isolated transaction, so one stale/conflicting channel does not prevent the
	 * remaining candidates from being applied. */
	async approveAll(runId: string, reviewerId: string) {
		await this.findRun(runId);
		const pendingItems = await this.itemRepo.find({
			select: { id: true },
			where: {
				syncRunId: runId,
				syncResult: YoutubeChannelSyncResult.CHANGE_DETECTED,
				reviewStatus: YoutubeChannelSyncReviewStatus.PENDING,
			},
			order: { createdAt: 'ASC' },
		});
		const results = await this.approveItems(
			{ itemIds: pendingItems.map((item) => item.id) },
			reviewerId,
		);
		return {
			totalPending: pendingItems.length,
			approved: results.filter((item) => item.applied).length,
			stale: results.filter((item) => item.stale).length,
			failed: results.filter((item) => item.error).length,
			items: results,
		};
	}

	async rejectItem(
		itemId: string,
		dto: RejectYoutubeChannelSyncItemDto,
		reviewerId: string,
	): Promise<YoutubeChannelSyncItem> {
		const item = await this.itemRepo.findOne({ where: { id: itemId } });
		if (!item)
			throw new NotFoundException(
				`YouTube channel sync item ${itemId} not found`,
			);
		if (item.reviewStatus !== YoutubeChannelSyncReviewStatus.PENDING) {
			throw new BadRequestException(
				'Only a pending item can be rejected',
			);
		}
		item.reviewStatus = YoutubeChannelSyncReviewStatus.REJECTED;
		item.note = dto.note?.trim() || null;
		item.reviewedBy = reviewerId;
		item.reviewedAt = new Date();
		return this.itemRepo.save(item);
	}

	/** Resume a run that was queued before this process was ready, or recover a
	 * worker that stopped making progress. A resumed run discards its unfinished
	 * staging rows and scans afresh, so no partial proposal can be approved. */
	@Interval(60_000)
	async resumeUnfinishedRun(): Promise<void> {
		const staleBefore = new Date(Date.now() - 15 * 60_000);
		await this.runRepo
			.createQueryBuilder()
			.update(YoutubeChannelSyncRun)
			.set({ status: YoutubeChannelSyncRunStatus.PENDING })
			.where('status = :running AND updated_at < :staleBefore', {
				running: YoutubeChannelSyncRunStatus.RUNNING,
				staleBefore,
			})
			.execute();

		const pending = await this.runRepo.findOne({
			where: { status: YoutubeChannelSyncRunStatus.PENDING },
			order: { createdAt: 'ASC' },
		});
		if (pending) void this.processRun(pending.id);
	}

	private async processRun(runId: string): Promise<void> {
		const claim = await this.runRepo
			.createQueryBuilder()
			.update(YoutubeChannelSyncRun)
			.set({
				status: YoutubeChannelSyncRunStatus.RUNNING,
				startedAt: new Date(),
			})
			.where('id = :runId AND status = :status', {
				runId,
				status: YoutubeChannelSyncRunStatus.PENDING,
			})
			.execute();
		if (!claim.affected) return;
		let run = await this.findRun(runId);
		const counts: SyncCounts = {
			processedChannels: 0,
			changeDetectedCount: 0,
			noChangeCount: 0,
			missingYoutubeChannelIdCount: 0,
			notFoundCount: 0,
			failedCount: 0,
		};

		try {
			await this.itemRepo.delete({ syncRunId: runId });
			const channels = await this.channelRepo.find({
				order: { id: 'ASC' },
			});
			run.totalChannels = channels.length;

			const byYoutubeId = new Map<string, Channel[]>();
			const missingIdItems: YoutubeChannelSyncItem[] = [];
			for (const channel of channels) {
				const youtubeChannelId = channel.youtubeChannelId?.trim();
				if (!youtubeChannelId) {
					missingIdItems.push(
						this.buildItem(
							channel,
							YoutubeChannelSyncResult.MISSING_YOUTUBE_CHANNEL_ID,
						),
					);
					continue;
				}
				const group = byYoutubeId.get(youtubeChannelId) ?? [];
				group.push(channel);
				byYoutubeId.set(youtubeChannelId, group);
			}
			await this.saveItems(run, missingIdItems, counts);

			const ids = [...byYoutubeId.keys()];
			for (let index = 0; index < ids.length; index += 50) {
				const batchIds = ids.slice(index, index + 50);
				try {
					const remoteChannels =
						await this.youtubeApiClient.getChannelsById(batchIds);
					const items: YoutubeChannelSyncItem[] = [];
					for (const youtubeChannelId of batchIds) {
						const remote = remoteChannels.get(youtubeChannelId);
						for (const channel of byYoutubeId.get(
							youtubeChannelId,
						) ?? []) {
							items.push(
								remote
									? this.buildItem(channel, undefined, remote)
									: this.buildItem(
											channel,
											YoutubeChannelSyncResult.NOT_FOUND,
										),
							);
						}
					}
					await this.saveItems(run, items, counts);
				} catch (error: any) {
					if (error instanceof NoAvailableYoutubeKeyError)
						throw error;
					this.logger.warn(
						`YouTube channel batch ${index / 50 + 1} failed: ${error.message}`,
					);
					const failedItems = batchIds.flatMap((youtubeChannelId) =>
						(byYoutubeId.get(youtubeChannelId) ?? []).map(
							(channel) =>
								this.buildItem(
									channel,
									YoutubeChannelSyncResult.FAILED,
									undefined,
									error.message,
								),
						),
					);
					await this.saveItems(run, failedItems, counts);
				}
			}

			run.status = counts.failedCount
				? YoutubeChannelSyncRunStatus.PARTIAL
				: YoutubeChannelSyncRunStatus.COMPLETED;
			run.completedAt = new Date();
			run = await this.runRepo.save(run);
			this.logger.log(
				`YouTube channel sync ${run.id} completed: ${run.processedChannels}/${run.totalChannels}`,
			);
		} catch (error: any) {
			run.status = YoutubeChannelSyncRunStatus.FAILED;
			run.completedAt = new Date();
			run.errorSummary = error.message;
			await this.runRepo.save(run);
			this.logger.error(
				`YouTube channel sync ${runId} failed: ${error.message}`,
				error.stack,
			);
		}
	}

	private buildItem(
		channel: Channel,
		forcedResult?: YoutubeChannelSyncResult,
		remote?: YoutubeChannelSnippet,
		errorMessage?: string,
	): YoutubeChannelSyncItem {
		const item = this.itemRepo.create({
			channelId: channel.id,
			youtubeChannelId: channel.youtubeChannelId,
			currentName: channel.name,
			currentThumbUrl: channel.thumbUrl,
			channelUpdatedAtSnapshot: channel.updatedAt,
			changedFields: [],
			syncResult: forcedResult ?? YoutubeChannelSyncResult.NO_CHANGE,
			reviewStatus: null,
			errorMessage: errorMessage ?? null,
		});
		if (forcedResult) return item;

		const changedFields: Array<'name' | 'thumbUrl'> = [];
		const proposedName = remote?.title?.trim() || null;
		const proposedThumbUrl = this.normalizeThumbnailUrl(
			remote?.thumbnailUrl,
		);
		if (proposedName && proposedName !== channel.name)
			changedFields.push('name');
		if (proposedThumbUrl !== channel.thumbUrl)
			changedFields.push('thumbUrl');

		item.proposedName = proposedName;
		item.proposedThumbUrl = proposedThumbUrl;
		item.changedFields = changedFields;
		item.syncResult = changedFields.length
			? YoutubeChannelSyncResult.CHANGE_DETECTED
			: YoutubeChannelSyncResult.NO_CHANGE;
		item.reviewStatus = changedFields.length
			? YoutubeChannelSyncReviewStatus.PENDING
			: null;
		return item;
	}

	private normalizeThumbnailUrl(
		value: string | null | undefined,
	): string | null {
		if (!value || value.length > 500) return null;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' ? url.toString() : null;
		} catch {
			return null;
		}
	}

	private async saveItems(
		run: YoutubeChannelSyncRun,
		items: YoutubeChannelSyncItem[],
		counts: SyncCounts,
	): Promise<void> {
		if (!items.length) return;
		for (const item of items) item.syncRunId = run.id;
		await this.itemRepo.save(items, { chunk: 500 });

		for (const item of items) {
			counts.processedChannels++;
			switch (item.syncResult) {
				case YoutubeChannelSyncResult.CHANGE_DETECTED:
					counts.changeDetectedCount++;
					break;
				case YoutubeChannelSyncResult.NO_CHANGE:
					counts.noChangeCount++;
					break;
				case YoutubeChannelSyncResult.MISSING_YOUTUBE_CHANNEL_ID:
					counts.missingYoutubeChannelIdCount++;
					break;
				case YoutubeChannelSyncResult.NOT_FOUND:
					counts.notFoundCount++;
					break;
				case YoutubeChannelSyncResult.FAILED:
					counts.failedCount++;
					break;
			}
		}

		Object.assign(run, counts);
		await this.runRepo.save(run);
	}
}
