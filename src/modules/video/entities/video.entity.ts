import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { VideoArtist } from 'src/modules/video-artist/entities/video-artist.entity';
import { VideoContributor } from 'src/modules/video-contributor/entities/video-contributor.entity';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';

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
		unique: true,
		comment:
			'Mã ISRC (International Standard Recording Code) định danh duy nhất cho bản ghi video',
	})
	isrc: string;

	@Column({
		type: 'boolean',
		default: false,
		comment:
			'Đánh dấu video chứa nội dung nhạy cảm (Explicit) cần cảnh báo giới hạn độ tuổi',
	})
	explicit: boolean;

	@Column({
		type: 'boolean',
		default: false,
		comment:
			'Xác định video có sử dụng công nghệ hoặc nội dung do AI tạo ra hay không',
	})
	isAi: boolean;

	@Column({
		type: 'varchar',
		length: 150,
		comment:
			'Tên kênh YouTube Vevo chỉ định để đăng tải video (ví dụ: TaylorSwiftVEVO)',
	})
	channel: string;

	@Column({
		type: 'text',
		nullable: true,
		comment:
			'Nội dung mô tả (description) đi kèm video khi xuất bản lên YouTube',
	})
	description: string | null;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment: 'Danh sach tu khoa video phan phoi len YouTube/Vevo',
	})
	keywords: string[] | null;

	@Column({
		type: 'boolean',
		default: false,
		comment:
			'Đánh dấu video dành riêng cho trẻ em (Made For Kids) theo quy định của YouTube',
	})
	isKids: boolean;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Dang video o trang thai khong cong khai tren YouTube/Vevo',
	})
	isUnlisted: boolean;

	@Column({
		type: 'jsonb',
		nullable: true,
		comment:
			'Danh sách tệp phụ đề đính kèm cấu trúc: [{ language: "vi", fileId: "uuid", fileName: "abc.srt" }]',
	})
	subtitles: { language: string; fileId: string; fileName: string }[];

	@Column({
		type: 'varchar',
		length: 100,
		nullable: true,
		comment:
			'Tên nhà cung cấp nội dung (Content Provider) phân phối sản phẩm',
	})
	contentProvider: string | null;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: 'Chủ sở hữu tác phẩm bản quyền gốc (Repertoire Owner / Label)',
	})
	copyrightOwner: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'partner_custom_id_1',
		nullable: true,
		comment:
			'Mã định danh tùy chỉnh số 1 của đối tác để ánh xạ nội bộ hệ thống',
	})
	partnerCustomId1: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'partner_custom_id_2',
		nullable: true,
		comment:
			'Mã định danh tùy chỉnh số 2 của đối tác để ánh xạ nội bộ hệ thống',
	})
	partnerCustomId2: string | null;

	@Column({
		type: 'uuid',
		name: 'file_id',
		nullable: true,
		comment:
			'Khóa ngoại trỏ sang bảng files, đại diện cho tệp video nguồn tải lên hệ thống',
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
}
