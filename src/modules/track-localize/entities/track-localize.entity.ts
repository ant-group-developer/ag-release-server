import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('track_localize', {
	comment:
		'Bảng lưu thông tin bản địa hóa (localize) tiêu đề track theo ngôn ngữ',
})
export class TrackLocalize extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID ngôn ngữ áp dụng cho bản localize',
	})
	languageId: string;

	@ManyToOne(() => Language, (language) => language.trackLocalizes)
	language: Language;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID track được bản địa hóa',
	})
	trackId: string;

	@Column({
		type: 'varchar',
		length: 150,
		comment: 'Tiêu đề track theo ngôn ngữ',
	})
	title: string;

	@Column({
		type: 'varchar',
		length: 150,
		nullable: true,
		comment: 'Phiên bản track theo ngôn ngữ (nếu có)',
	})
	version: string | null;

	@ManyToOne(() => Track, (track) => track.trackLocalizes)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
