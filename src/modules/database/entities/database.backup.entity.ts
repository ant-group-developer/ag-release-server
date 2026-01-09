import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { StatusBackup } from '../enums/database.enum';

@Entity('backups', {
	comment: 'Lịch sử và trạng thái các phiên sao lưu cơ sở dữ liệu',
})
export class Backup extends BaseUUIDEntity {
	@Column({
		type: 'enum',
		enum: StatusBackup,
		default: StatusBackup.RUNNING,
		comment: 'Trạng thái hiện tại của phiên backup',
	})
	status: StatusBackup;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'URL file backup trên Google Drive',
	})
	urlDrive: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'URL file backup trên Google Cloud Storage',
	})
	urlGcs: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'Thư mục lưu backup trên Google Cloud Storage',
	})
	urlFolderGcs: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		nullable: true,
		comment: 'Thư mục lưu backup trên Google Drive',
	})
	urlFolderDrive: string | null;

	@Column({
		type: 'varchar',
		length: 100 + 'YYYYMMDDHHmmss_'.length,
		comment: 'Tên file backup',
	})
	fileName: string;

	@Column({
		type: 'int',
		default: 0,
		comment: 'Thời gian thực hiện backup (giây)',
	})
	elapsedTime: number;

	@Column({
		type: 'bigint',
		default: 0,
		comment: 'Dung lượng file backup (byte)',
	})
	fileSize: number;

	@Column({
		type: 'text',
		nullable: true,
		comment: 'Thông tin lỗi nếu backup thất bại',
	})
	error: string | null;
}
