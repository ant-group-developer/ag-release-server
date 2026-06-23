import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReleaseExecutionStepEngine } from '../services/release-execution3.engine';

@ApiTags('Release Execution Step Test')
@Controller('release-execution-step-test')
export class ReleaseExecutionStepTestController {
	constructor(private readonly engine: ReleaseExecutionStepEngine) {}

	@Post(':stepId/run')
	async runStep(@Param('stepId') stepId: string) {
		// return this.engine.runByStepId(stepId);
	}
}
