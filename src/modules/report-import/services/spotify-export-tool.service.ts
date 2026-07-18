import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { ImportJob, ImportJobSourceType } from '../../etl/interfaces';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { TriggerSpotifyExportDto } from '../dto/spotify-export-tool.dto';

interface SpotifyExportSyncResponse {
	success: boolean;
	jobSpoId?: string;
	message: string;
}

interface SpotifyExportJobLog {
	id: number;
	jobSpoId: string;
	stepName: string;
	status: string;
	message: string;
	timestamp: string;
}

interface SpotifyExportJobStatusResponse {
	job: {
		id: string;
		triggerType: string;
		status: 'running' | 'success' | 'failed';
		force: boolean;
		startedAt: string;
		completedAt: string | null;
	};
	logs: SpotifyExportJobLog[];
}

interface SpotifyExportHistoryRecord {
	id: string;
	boxFileId: string;
	boxFolderId: string;
	folderName: string;
	fileName: string;
	fileSize: number;
	status: string;
	errorMessage: string | null;
	downloadedAt: string;
	r2ObjectKey: string;
	r2UploadedAt: string | null;
	createdAt: string;
}

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 phút, tránh treo job vô hạn nếu ag-release-tool-export không phản hồi

/**
 * Gọi sang ag-release-tool-export để kích hoạt đồng bộ Box -> R2 (prefix spotify-reports/).
 * Service đó không callback ngược lại — nên phía này tự poll jobSpoId tới khi xong,
 * rồi bọc kết quả vào 1 ImportJob nội bộ để theo dõi qua GET /report-import/jobs/:jobId/status
 * (giống mọi job khác trong hệ thống). SpotifyR2SyncService (cron riêng, đã có sẵn) sẽ tự
 * phát hiện file mới trên R2 và import — không gọi trực tiếp từ đây.
 */
@Injectable()
export class SpotifyExportToolService {
	private readonly logger = new Logger(SpotifyExportToolService.name);

	constructor(
		private readonly httpService: HttpService,
		private readonly importJobsService: ImportJobsService,
	) {}

	async triggerExport(dto: TriggerSpotifyExportDto): Promise<ImportJob> {
		const response = await this.callSync(dto.force);

		if (!response.success || !response.jobSpoId) {
			throw new Error(
				response.message ||
					'ag-release-tool-export từ chối kích hoạt đồng bộ.',
			);
		}

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.SPOTIFY_EXPORT_TRIGGER,
			params: { jobSpoId: response.jobSpoId, force: !!dto.force },
		});

		void this.pollUntilDone(job.id, response.jobSpoId);

		return job;
	}

	private async callSync(
		force?: boolean,
	): Promise<SpotifyExportSyncResponse> {
		const { data } = await firstValueFrom(
			this.httpService.post<SpotifyExportSyncResponse>(
				`${process.env.CI_TOOL_URL}/api/spotify/sync`,
				{ force: !!force },
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

	private async getJobStatus(
		jobSpoId: string,
	): Promise<SpotifyExportJobStatusResponse> {
		const { data } = await firstValueFrom(
			this.httpService.get<SpotifyExportJobStatusResponse>(
				`${process.env.CI_TOOL_URL}/api/spotify/job/${jobSpoId}`,
				{
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
					},
				},
			),
		);
		return data;
	}

	private async getHistory(
		limit: number,
	): Promise<SpotifyExportHistoryRecord[]> {
		const { data } = await firstValueFrom(
			this.httpService.get<SpotifyExportHistoryRecord[]>(
				`${process.env.CI_TOOL_URL}/api/spotify/history`,
				{
					params: { limit },
					headers: {
						'x-api-key': process.env.CI_TOOL_API_KEY,
					},
				},
			),
		);
		return data;
	}

	private async pollUntilDone(
		jobId: string,
		jobSpoId: string,
	): Promise<void> {
		await this.importJobsService.markProcessing(jobId);
		const deadline = Date.now() + POLL_TIMEOUT_MS;

		try {
			let status: SpotifyExportJobStatusResponse;
			while (true) {
				status = await this.getJobStatus(jobSpoId);
				const lastLog = status.logs?.[status.logs.length - 1];

				await this.importJobsService.updateProgress(
					jobId,
					{
						progressLabel: lastLog
							? `[${lastLog.stepName}] ${lastLog.message}`
							: `Đang đồng bộ (jobSpoId=${jobSpoId})`,
					},
					true,
				);

				if (status.job.status !== 'running') break;

				if (Date.now() > deadline) {
					throw new Error(
						`Timeout chờ ag-release-tool-export xử lý jobSpoId=${jobSpoId} sau ${POLL_TIMEOUT_MS / 60000} phút.`,
					);
				}

				await sleep(POLL_INTERVAL_MS);
			}

			if (status.job.status === 'failed') {
				const errorLog = [...status.logs]
					.reverse()
					.find((l) => l.status === 'failed' || l.status === 'error');
				throw new Error(
					errorLog?.message ||
						`Đồng bộ Spotify (jobSpoId=${jobSpoId}) thất bại.`,
				);
			}

			const history = await this.getHistory(100).catch((err) => {
				this.logger.warn(
					`Không lấy được history sau khi job ${jobSpoId} success: ${err.message}`,
				);
				return [] as SpotifyExportHistoryRecord[];
			});

			const startedAtMs = new Date(status.job.startedAt).getTime();
			const newFolders = history.filter((h) => {
				if (h.status !== 'success' || !h.r2UploadedAt) return false;
				return new Date(h.r2UploadedAt).getTime() >= startedAtMs;
			});

			await this.importJobsService.markCompleted(jobId, {
				jobSpoId,
				foldersUploaded: newFolders.length,
				r2ObjectKeys: newFolders.map((f) => f.r2ObjectKey),
			});

			this.logger.log(
				`Spotify export job ${jobId} (jobSpoId=${jobSpoId}) completed, ${newFolders.length} folder(s) uploaded to R2.`,
			);
		} catch (err) {
			this.logger.error(
				`Spotify export job ${jobId} (jobSpoId=${jobSpoId}) failed: ${err.message}`,
				err.stack,
			);
			await this.importJobsService.markFailed(jobId, err);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
