import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { IsrcService } from 'src/modules/external/isrc/isrc.service';
import { getCoverArtThumbnails } from 'src/utils/util';
import { Repository } from 'typeorm';
import {
	QueryGetListTrackDto,
	SubmitCreateTrackDto,
	UpdateTrackDto,
} from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import { ITrack, ITrackNonDraft } from '../interfaces/track.interface';
import { TrackQueryService } from './track.query.service';
import { ReleaseLogService } from 'src/modules/release/modules/release-log/services/release-log.service';

@Injectable()
export class TrackService {
	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		private readonly trackQueryService: TrackQueryService,

		private readonly isrcService: IsrcService,
		private readonly appConfigService: AppConfigService,

		private readonly releaseLogService: ReleaseLogService,
	) {}

	async submit(
		id: string,
		data: SubmitCreateTrackDto,
	): Promise<ITrackNonDraft> {
		// validate id
		await this.trackQueryService.findOne(id);

		// validate nonDraft
		const trackNonDraft = this.trackQueryService.ensureNonDraftTrack({
			...data,
			trackArtists: [],
		});

		await this.trackRepo.update(id, trackNonDraft);
		const result = await this.trackQueryService.findOne(id);

		// convert to ITrackNonDraft
		return this.trackQueryService.ensureNonDraftTrack(result);
	}

	// read
	async getDetail(id: string): Promise<Track> {
		const trackDb = await this.trackQueryService.getDetailOne(id);
		return this.enhanceDetailsOne(trackDb);
	}

	async getDetailMetadata(id: string): Promise<Track> {
		return await this.trackQueryService.getDetailMetadataOne(id);
	}

	async getDetailAudioFile(id: string): Promise<Track> {
		return await this.trackQueryService.getDetailAudioFileOne(id);
	}

	async getList(query: QueryGetListTrackDto): Promise<PageDto<Track>> {
		const { page, pageSize } = query;

		const [tracksDb, totalItems] =
			await this.trackQueryService.getList(query);

		const enhancedTracks = this.enhanceDetailsList(tracksDb);

		return new PageDto({
			items: enhancedTracks,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(query: QueryGetListTrackDto): Promise<PageDto<Track>> {
		const { page, pageSize } = query;

		const { items, totalItems } =
			await this.trackQueryService.getListSimple(query);

		return new PageDto({
			items,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListWithRevenue(
		query: QueryGetListTrackDto,
	): Promise<PageDto<Track>> {
		const { page, pageSize } = query;

		const [tracksDb, totalItems] =
			await this.trackQueryService.getListWithRevenue(query);

		return new PageDto({
			items: tracksDb,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	// enhance
	private enhanceDetailsOne(track: Track) {
		track.release.coverArtThumbnails = getCoverArtThumbnails(
			track.release.releaseCoverArts,
		);

		track.release.releaseCoverArts = undefined;
		return track;
	}

	private enhanceDetailsList(tracks: Track[]) {
		return tracks.map((track) => this.enhanceDetailsOne(track));
	}

	// update
	async update(id: string, data: UpdateTrackDto): Promise<ITrack> {
		const {
			//  releaseId,
			primaryGenreId,
			subGenreId,
		} = data;

		const track = await this.trackQueryService.findOne(id);

		if (primaryGenreId && primaryGenreId !== track.primaryGenreId) {
			await this.trackQueryService.validateForeignKey({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== track.subGenreId) {
			await this.trackQueryService.validateForeignKey({
				subGenreId,
			});
		}

		await this.trackRepo.update(id, data);
		return await this.trackQueryService.findOne(id);
	}

	async genISRC(trackId: string) {
		const track = await this.trackQueryService.getDetailOne(trackId);

		// Nếu đã có ISRC thì tuỳ bạn: return luôn hoặc throw
		if (track.isrc) return track.isrc;

		// -------- Map dữ liệu từ Track sang CreateIsrc --------
		// Artist: lấy nghệ sĩ chính (tuỳ cấu trúc TrackArtist của bạn)
		const mainArtistName = track.trackArtists?.[0]?.artist?.name ?? '';

		if (!mainArtistName) {
			this.releaseLogService.failed({
				releaseId: track.releaseId,
				step: 'genISRC',
				message: 'Bài hát thiếu thông tin nghệ sĩ',
			});

			throw new ResponseError({
				message: 'Bài hát thiếu thông tin nghệ sĩ',
				data: track.title,
			});
		}

		// Registrant: lấy từ P-Line owner hoặc release label (tuỳ domain)
		const registrantName = track.release?.label?.name ?? '';
		if (!registrantName) {
			this.releaseLogService.failed({
				releaseId: track.releaseId,
				step: 'genISRC',
				message: 'Thiếu thông tin registrantName (P-Line owner/label)',
			});

			throw new ResponseError({
				message: 'Thiếu thông tin registrantName (P-Line owner/label)',
			});
		}

		// Version title: ưu tiên version, không có thì "Original"
		const versionTitle = track.version?.trim()
			? track.version
			: 'Original Version';

		// Asset type: bạn map theo enum/domain thật của hệ thống ISRC
		const assetType = 'AUDIO';

		// Explicit: map theo trackSensitive (tuỳ bảng TrackSensitive của bạn)
		const explicit =
			(track.trackSensitive?.code ?? track.trackSensitive?.name ?? '')
				.toString()
				.toUpperCase()
				.includes('EXPLICIT') || false;

		// Year: ưu tiên pLineYear, fallback năm hiện tại
		const yearOfProduction = track.pLineYear ?? new Date().getUTCFullYear();

		// Duration: lấy từ audioFile nếu có (tuỳ field thực tế)
		// Nếu audioFile không có duration, bạn cần thay bằng field đúng
		const duration = track.audioFile?.duration ?? 0;
		if (!duration || duration <= 0) {
			this.releaseLogService.failed({
				releaseId: track.releaseId,
				step: 'genISRC',
				message: 'Thiếu duration (giây) từ audioFile',
			});

			throw new ResponseError({
				message: 'Thiếu duration (giây) từ audioFile',
			});
		}

		const prefixIsrcId =
			this.appConfigService.cache.config.generator.prefixIsrcDefaultId;

		if (!prefixIsrcId) {
			this.releaseLogService.failed({
				releaseId: track.releaseId,
				step: 'genISRC',
				message: 'Chưa cấu hình prefixIsrcId',
			});

			throw new ResponseError({
				message: 'Chưa cấu hình prefixIsrcId',
			});
		}

		const payload = {
			registrantName,
			recordingArtist: mainArtistName,
			recordingTitle: track.title,
			versionTitle,
			assetType,
			immersive: false, // track của bạn chưa có field này => default
			explicit,
			yearOfProduction,
			duration,
			isAdded: false, // tuỳ business
			prefixIsrcId,
		};

		// -------- Call gRPC tạo ISRC --------
		// token: tuỳ bạn lấy ở đâu (service-to-service thì có thể dùng internal token)
		// const token = await this.getInternalToken(); // bạn tự implement
		const res = await this.isrcService.create(payload);
		// created giả định có created.isrc (bạn sửa theo response thật)
		const newIsrc = res.data.code;
		if (!newIsrc) {
			this.releaseLogService.failed({
				releaseId: track.releaseId,
				step: 'genISRC',
				message: 'Service ISRC không trả về mã ISRC',
			});

			throw new ResponseError({
				message: 'Service ISRC không trả về mã ISRC',
			});
		}

		// -------- Update track --------
		await this.update(trackId, { isrc: newIsrc });

		return newIsrc;
	}

}
