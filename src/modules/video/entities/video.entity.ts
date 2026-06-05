import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { VideoArtist } from 'src/modules/video-artist/entities/video-artist.entity';
import { VideoContributor } from 'src/modules/video-contributor/entities/video-contributor.entity';
import { VideoGenre } from 'src/modules/video-genre/entities/video-genre.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';

export enum VideoAiContent {
	ALL = 'ALL',
	PARTLY = 'PARTLY',
	NONE = 'NONE',
	UNDETERMINED = 'UNDETERMINED',
}

export enum VideoMadeForKids {
	YES = 'YES',
	NO = 'NO',
	CHANNEL_DEFAULT = 'CHANNEL_DEFAULT',
}

export enum VideoVisibility {
	DEFAULT = 'DEFAULT',
	UNLISTED_ON_YOUTUBE = 'UNLISTED_ON_YOUTUBE',
	UNLISTED_ON_VEVO = 'UNLISTED_ON_VEVO',
	UNLISTED_ON_YOUTUBE_VEVO = 'UNLISTED_ON_YOUTUBE_VEVO',
}

/**
 * THỰC THỂ VIDEO (VIDEO ENTITY)
 *
 * - Mô tả: Lưu trữ thông tin metadata đặc thù của Video phục vụ luồng phân phối Vevo/YouTube.
 * - Thiết kế: Liên kết 1:1 với thực thể `Release` sẵn có trong hệ thống để tận dụng tối đa
 *   các thông tin dùng chung như Title, Genre, Language, Artist, Contributor, Release Date.
 */
@Entity('videos', {
	comment:
		'Bảng lưu trữ thông tin metadata kỹ thuật và cấu hình phân phối của Video',
})
export class Video extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'uuid',
		name: 'release_id',
		unique: true,
		comment: 'Liên kết 1:1 sang thực thể Release sở hữu Video này',
	})
	releaseId: string;

	@OneToOne(() => Release, (release) => release.video, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'varchar',
		length: 20,
		nullable: true,
		comment:
			'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi video' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	isrc: string | null;

	@Column({
		type: 'boolean',
		nullable: true,
		default: false,
		comment:
			'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổi' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	explicit: boolean | null;

	@Column({
		name: 'ai_content',
		type: 'varchar',
		length: 20,
		nullable: true,
		default: VideoAiContent.UNDETERMINED,
		comment:
			'Trang thai noi dung AI cua video theo VEVO: ALL, PARTLY, NONE, UNDETERMINED' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	aiContent: VideoAiContent | null;

	@Column({
		type: 'uuid',
		name: 'channel_id',
		nullable: true,
		comment:
			'Channel chi dinh de dang tai video len YouTube/Vevo' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	channelId: string | null;

	@ManyToOne(() => Channel, (channel) => channel.videos, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'channel_id' })
	channel: Channel | null;

	@Column({
		type: 'text',
		nullable: true,
		comment:
			'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTube' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	description: string | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment:
			'Danh sach tu khoa video phan phoi len YouTube/Vevo' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	keywords: string[] | null;

	@Column({
		type: 'varchar',
		length: 20,
		nullable: true,
		default: VideoMadeForKids.CHANNEL_DEFAULT,
		comment:
			'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube: YES, NO, CHANNEL_DEFAULT' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	madeForKids: VideoMadeForKids | null;

	@Column({
		name: 'visibility',
		type: 'varchar',
		length: 50,
		nullable: true,
		default: VideoVisibility.DEFAULT,
		comment:
			'Visibility của video: Default, Unlisted on YouTube, Unlisted on Vevo, Unlisted on YouTube/Vevo' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	visibility: VideoVisibility | null;

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
		comment:
			'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩm' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	contentProvider: string | null;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment:
			'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	copyrightOwner: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'partner_custom_id_1',
		nullable: true,
		comment:
			'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thống' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	partnerCustomId1: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'partner_custom_id_2',
		nullable: true,
		comment:
			'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thống' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	partnerCustomId2: string | null;

	@Column({
		type: 'uuid',
		name: 'file_id',
		nullable: true,
		comment:
			'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thống' +
			COMMENT_FOR_NULLABLE_DRAFT,
	})
	fileId: string | null;

	@OneToOne(() => FileEntity)
	@JoinColumn({ name: 'file_id' })
	videoFile: FileEntity | null;

	@OneToMany(() => VideoArtist, (videoArtist) => videoArtist.video)
	videoArtists: VideoArtist[];

	@OneToMany(
		() => VideoContributor,
		(videoContributor) => videoContributor.video,
	)
	videoContributors: VideoContributor[];

	@OneToMany(() => VideoGenre, (videoGenre) => videoGenre.video)
	videoGenres: VideoGenre[];
}
