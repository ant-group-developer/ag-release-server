import { Repository } from 'typeorm';

export async function newTransaction(repo: Repository<any>) {
	const queryRunner = repo.manager.connection.createQueryRunner();
	await queryRunner.connect();
	await queryRunner.startTransaction();

	return queryRunner;
}
