import { Label } from '../entities/label.entity';

export interface IDataFromDb {
	entities: Label[];
	raw: {
		label_id: string;
		track_count: string;
		release_count: string;
	}[];
}
