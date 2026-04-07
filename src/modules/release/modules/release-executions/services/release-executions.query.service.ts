import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListReleaseExecutionDto } from '../dto/release-execution.dto';
import { ReleaseExecution } from '../entities/release-execution.entity';

@Injectable()
export class ReleaseExecutionsQueryService {
    constructor(
        @InjectRepository(ReleaseExecution)
        private readonly executionRepo: Repository<ReleaseExecution>,
    ) {}

    async getList(query: QueryGetListReleaseExecutionDto): Promise<[ReleaseExecution[], number]> {
        const { releaseId, skip, pageSize } = query;

        const queryBuilder = this.executionRepo.createQueryBuilder('exec')
            .leftJoinAndSelect('exec.executionDsps', 'dsp')
            .leftJoinAndSelect('dsp.steps', 'step');

        if (releaseId) {
            queryBuilder.andWhere('exec.releaseId = :releaseId', { releaseId });
        }

        queryBuilder.orderBy('exec.createdAt', 'DESC');
        queryBuilder.skip(skip).take(pageSize);

        return await queryBuilder.getManyAndCount();
    }
}
