import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { QueryGetListReleaseExecutionDto } from '../dto/release-execution.dto';
import { ReleaseExecution } from '../entities/release-execution.entity';
import { ReleaseExecutionsQueryService } from './release-executions.query.service';

@Injectable()
export class ReleaseExecutionsService {
    constructor(
        @InjectRepository(ReleaseExecution)
        private executionRepo: Repository<ReleaseExecution>,
        private readonly queryService: ReleaseExecutionsQueryService,
    ) {}

    // C - Create (Placeholder)
    // Lưu ý: Việc Create phức tạp kèm các Step nên được uỷ quyền cho 1 Class riêng là ExecutionPlanner xử lý
    async create(data: Partial<ReleaseExecution>) {
        const newExecution = this.executionRepo.create(data);
        return this.executionRepo.save(newExecution);
    }

    // R - Read (List)
    async getList(query: QueryGetListReleaseExecutionDto): Promise<PageDto<ReleaseExecution>> {
        const [items, totalItems] = await this.queryService.getList(query);

        return new PageDto({
            items,
            metadata: {...query, totalItems},
        });
    }

    // R - Read (One)
    async findOne(id: string) {
        const execution = await this.executionRepo.findOne({
            where: { id },
            relations: {
                executionDsps: {
                    steps: true,
                },
            },
            order: {
                createdAt: 'DESC',
                executionDsps: {
                    createdAt: 'ASC',
                    steps: {
                        sortOrder: 'ASC'
                    }
                }
            }
        });

        if (!execution) {
            throw new NotFoundException(`ReleaseExecution with ID ${id} not found`);
        }

        return execution;
    }

    // D - Delete
    async remove(id: string) {
        const execution = await this.findOne(id);
        return this.executionRepo.remove(execution);
    }
}
