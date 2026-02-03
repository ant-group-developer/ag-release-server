import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('files', {
	comment:
		'Bảng lưu trữ metadata của các file trong hệ thống (audio, image, v.v.)',
})
export class FileEntity extends BaseUUIDEntity {
	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu file đã được submit / sử dụng chính thức hay chưa',
	})
	isSubmitted: boolean;

	@Column({
		type: 'varchar',
		length: 100 + 'YYYYMMDDHHmmss_'.length,
		comment: 'Tên file gốc, có thể kèm prefix timestamp',
	})
	fileName: string;

	@Column({
		type: 'varchar',
		length: 200,
		comment: 'Key lưu trữ file trong bucket (đường dẫn nội bộ)',
	})
	key: string;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'MIME type của file (ví dụ: audio/wav, image/png)',
	})
	contentType: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Phần mở rộng của file (ví dụ: wav, mp3, png)',
	})
	extension: string;

	@Column({
		type: 'bigint',
		comment: 'Dung lượng file, tính bằng byte',
	})
	fileSize: number;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'Tên bucket lưu trữ file',
	})
	bucket: string;
}
