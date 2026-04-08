import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { QueryGetListReleaseExecutionDto, ReleaseExecutionPageDto } from '../dto/release-execution.dto';
import { ReleaseExecution } from '../entities/release-execution.entity';
import { ReleaseExecutionsQueryService } from './release-executions.query.service';
import { ReleaseExecutionProcessorService } from './release-execution-processor.service';

@Injectable()
export class ReleaseExecutionsService {
    constructor(
        @InjectRepository(ReleaseExecution)
        private executionRepo: Repository<ReleaseExecution>,
        private readonly queryService: ReleaseExecutionsQueryService,

        private readonly releaseExecutionProcessorService: ReleaseExecutionProcessorService
    ) {}

    // C - Create (Placeholder)
    // Lưu ý: Việc Create phức tạp kèm các Step nên được uỷ quyền cho 1 Class riêng là ExecutionPlanner xử lý
    async createAndProcess(data: Partial<ReleaseExecution>) {
        const newExecution = await this.create(data)
        await this.releaseExecutionProcessorService.processQueueItem(newExecution.id)
        return newExecution
    }

    async create(data: Partial<ReleaseExecution>) {
        const newExecution = this.executionRepo.create(data);
        return this.executionRepo.save(newExecution);
    }

    // R - Read (List)
    async getList(query: QueryGetListReleaseExecutionDto): Promise<ReleaseExecutionPageDto<ReleaseExecution>> {
        const [items, totalItems] = await this.queryService.getList(query);
        const statusCounts = await this.queryService.getStatusCounts(query);

        return new ReleaseExecutionPageDto({
            items,
            metadata: {
                ...query, 
                totalItems,
                statusCounts,
            },
        });
    }

    // R - Read Execution Dsps
    async getExecutionDsps(id: string) {
        const execution = await this.findOne(id);
        return execution.executionDsps || [];
    }

    // R - Read (One)
    async findOne(id: string) {
        const execution = await this.executionRepo.findOne({
            where: { id },
            relations: {
                release: true,
                executionDsps: {
                    dsp: true,
                    steps: true
                },
            },
            order: {
                createdAt: 'DESC',
                executionDsps: {
                    createdAt: 'ASC',
                    steps: {
                        order: 'ASC'
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
