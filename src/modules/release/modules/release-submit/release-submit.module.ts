// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { DistributionModule } from 'src/modules/distribution/distribution.module';
// import { ReleaseModule } from 'src/modules/release/release.module';
// import { ReleaseSubmitStep } from './entities/release-submit-step.entity';
// import { ReleaseSubmit } from './entities/release-submit.entity';
// import { State51Email } from './entities/state51-email.entity';
// import { ReleaseSubmitController } from './release-submit.controller';
// import { State51EmailController } from './state51-email.controller';
// import { ReleaseSubmitService2 } from './services/release-submit2.service';
// import { State51EmailService } from './services/state51-email.service';
// // import { ReleaseSubmitService } from './services/release-submit.service';

// @Module({
// 	imports: [
// 		TypeOrmModule.forFeature([ReleaseSubmit, ReleaseSubmitStep, State51Email]),
// 		ReleaseModule,
// 		DistributionModule,
// 	],
// 	controllers: [ReleaseSubmitController, State51EmailController],
// 	providers: [ReleaseSubmitService2, State51EmailService],
// 	exports: [ReleaseSubmitService2, State51EmailService],
// })
// export class ReleaseSubmitModule {}
