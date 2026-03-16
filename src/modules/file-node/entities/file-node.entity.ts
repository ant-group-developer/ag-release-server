// src/modules/file-node/entities/file-node.entity.ts
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';

export enum FileNodeType {
	FOLDER = 'folder',
	FILE = 'file',
}

@Entity('file_node', {
	comment: 'Cây thư mục và file được quét từ SFTP hoặc upload',
})
@Index(['parentId', 'name'], { unique: true })
export class FileNode extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 255,
		comment: 'Tên file hoặc folder',
	})
	name: string;

	@Column({
		type: 'enum',
		enum: FileNodeType,
		comment: 'Loại node: file hoặc folder',
	})
	type: FileNodeType;

	@Column({
		name: 'parent_id',
		type: 'uuid',
		nullable: true,
		comment: 'ID node cha (null nếu là root)',
	})
	parentId: string | null;

	@Column({
		type: 'bigint',
		nullable: true,
		comment: 'Dung lượng file (bytes), folder có thể null',
	})
	size: number | null;

	@ManyToOne(() => FileNode, (node) => node.children, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'parent_id' })
	parent: FileNode;

	@OneToMany(() => FileNode, (node) => node.parent)
	children: FileNode[];
}
