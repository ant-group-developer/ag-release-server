import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FileEntity } from './bucket.file.entity';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';

@Entity('release_template_files')
@Index(['file_id'])
export class ReleaseTemplateFile extends BaseUUIDEntity {
  @Column({
    type: 'uuid',
    comment: 'ID file',
  })
  file_id: string;

  @ManyToOne(() => FileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: FileEntity;
}