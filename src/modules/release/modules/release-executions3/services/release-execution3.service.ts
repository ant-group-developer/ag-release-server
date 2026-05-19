import { Repository } from 'typeorm';
import { ReleaseExecution3 } from '../entites/release-execution3.entity';

export class ReleaseExecution3Service {
	constructor(
		private readonly releaseExecution3Repo: Repository<ReleaseExecution3>,
	) {}

	createNew() {}
	findOne() {}
	getList() {}
	cancel() {}
}
