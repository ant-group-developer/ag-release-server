import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { ConfigEntity } from './entities/config.entity';
import { ConfigDBService } from './config.db.service';
import { ConfigEntity } from './entities/config.entity';
import { envValidationSchema } from './validate/config.validate-env';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: envValidationSchema,
      isGlobal: true,
    }),
    TypeOrmModule.forFeature([ConfigEntity]),
  ],
  providers: [ConfigService, ConfigDBService],
  exports: [ConfigService, ConfigDBService],
})
export class ConfigCustomModule {}
