import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { StatusBackup } from '../enums/database.enum';

@Entity('backups')
export class Backup extends BaseUUIDEntity {
	@Column({
		type: 'enum',
		enum: StatusBackup,
		default: StatusBackup.RUNNING,
	})
	status: StatusBackup;

	@Column({ type: 'varchar', length: 255, nullable: true })
	urlDrive: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	urlGcs: string;

	@Column({ type: 'varchar', length: 100 + 'YYYYMMDDHHmmss_'.length })
	fileName: string;

	@Column({ type: 'int', default: 0 })
	elapsedTime: number;

	@Column({ type: 'bigint', default: 0 })
	fileSize: number;
}
