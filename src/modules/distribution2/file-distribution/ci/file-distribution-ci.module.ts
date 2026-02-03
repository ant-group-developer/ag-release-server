// // src/modules/access-bomb/file/file-distribution-ci.module.ts
// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { BucketModule } from 'src/modules/bucket/bucket.module';
// import { Country } from 'src/modules/country/entities/country.entity';
// import { Release } from 'src/modules/release/entities/release.entity';
// import { SftpModule } from '../../sftp/sftp.module';
// import { FileDistributionCiController } from './file-distribution-ci.controller';
// import { DistributionCiHistory } from './file-distribution.ci.entity';
// import { FileDistributionCiService } from './file-distribution.ci.service';

// @Module({
// 	imports: [
// 		TypeOrmModule.forFeature([Release, Country, DistributionCiHistory]),
// 		BucketModule,
// 		SftpModule,
// 	],
// 	providers: [FileDistributionCiService],
// 	controllers: [FileDistributionCiController],
// 	exports: [FileDistributionCiService],
// })
// export class FileDistributionCiModule {}
