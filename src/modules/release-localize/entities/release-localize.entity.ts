import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_localize', {
	comment:
		'Bảng lưu thông tin bản địa hóa (localize) tiêu đề release theo ngôn ngữ',
})
export class ReleaseLocalize extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID ngôn ngữ áp dụng cho bản localize',
	})
	languageId: string;

	@Column({
		type: 'uuid',
		comment: 'ID release được bản địa hóa',
	})
	releaseId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'language_id' })
	language: Language;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({
		type: 'varchar',
		length: 150,
		comment: 'Tiêu đề release theo ngôn ngữ',
	})
	title: string;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: 'Phiên bản release theo ngôn ngữ (nếu có)',
	})
	version: string | null;
}
