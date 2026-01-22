import { Repository } from 'typeorm';

export async function newTransaction(repo: Repository<any>) {
	const queryRunner = repo.manager.connection.createQueryRunner();
	await queryRunner.connect();
	await queryRunner.startTransaction();

	return queryRunner;
}

export async function withTransaction<T>(
	repo: Repository<any>,
	cb: (manager: any) => Promise<T>,
): Promise<T> {
	const transaction = await newTransaction(repo);

	try {
		const result = await cb(transaction.manager);
		await transaction.commitTransaction();
		return result;
	} catch (e) {
		await transaction.rollbackTransaction();
		throw e;
	} finally {
		await transaction.release();
	}
}
