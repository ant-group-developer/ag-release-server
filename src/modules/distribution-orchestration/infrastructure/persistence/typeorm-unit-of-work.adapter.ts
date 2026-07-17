import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
	TxContext,
	UnitOfWork,
} from '../../application/ports/unit-of-work.port';

/**
 * TypeOrmUnitOfWork — adapter thật cho UnitOfWork port (Nhịp 2.5).
 *
 * 1 uow.run() = 1 Postgres transaction:
 *   · createQueryRunner()  — mượn 1 connection từ pool
 *   · connect() + startTransaction() — BEGIN
 *   · truyền TxContext{ manager: queryRunner.manager } cho callback
 *   · callback throw → rollback + rethrow
 *   · callback resolve → commit + trả giá trị
 *   · release() trong finally — LUÔN LUÔN trả connection về pool (không rò rỉ)
 *
 * KHÔNG hỗ trợ nested transaction (savepoint) — chưa cần. Nếu handler
 * gọi uow.run() lồng nhau, transaction ngoài và trong sẽ độc lập.
 */
@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWork {
	constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

	async run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T> {
		const queryRunner = this.dataSource.createQueryRunner();
		await queryRunner.connect();
		await queryRunner.startTransaction();

		try {
			const ctx: TxContext = { manager: queryRunner.manager };
			const result = await work(ctx);
			await queryRunner.commitTransaction();
			return result;
		} catch (err) {
			// isTransactionActive false khi commit đã ném — tránh double-rollback ném đè lỗi gốc
			if (queryRunner.isTransactionActive) {
				await queryRunner.rollbackTransaction();
			}
			throw err;
		} finally {
			await queryRunner.release();
		}
	}
}
