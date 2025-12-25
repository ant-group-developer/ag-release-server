import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('genre')
export class Genre {
	@PrimaryColumn({ type: 'int' })
	id: number;

	@Column()
	name: string;

	@Column({ name: 'order_index', type: 'int' })
	order: number;
}
