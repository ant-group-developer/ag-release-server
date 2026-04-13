// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { ReleaseExecutionController } from './controllers/release-execution.controller';
// import { ReleaseExecutionDsp } from './entities/release-execution-dsp.entity';
// import { ReleaseExecutionStep } from './entities/release-execution-step.entity';
// import { ReleaseExecution } from './entities/release-execution.entity';
// import { ReleaseExecutionProcessorService } from './services/release-execution-processor.service';
// import { ReleaseExecutionsQueryService } from './services/release-executions.query.service';
// import { ReleaseExecutionsService } from './services/release-executions.service';

// @Module({
//     imports: [
//         TypeOrmModule.forFeature([
//             ReleaseExecution,
//             ReleaseExecutionDsp,
//             ReleaseExecutionStep,
//         ]),
//     ],
//     controllers: [ReleaseExecutionController],
//     providers: [
//         ReleaseExecutionsService,
//         ReleaseExecutionsQueryService,
//         ReleaseExecutionProcessorService
//     ],
//     exports: [ReleaseExecutionsService, ReleaseExecutionProcessorService],
// })
// export class ReleaseExecutionsModule {}
