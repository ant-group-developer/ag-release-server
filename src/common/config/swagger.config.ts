import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';

export const setupSwagger = (app: INestApplication): void => {
	const SWAGGER_ROUTE = 'api-docs';

	const configService = app.get(ConfigService);

	const username = configService.get<string>('SWAGGER_USER') as string;
	const password = configService.get<string>('SWAGGER_PASSWORD') as string;

	app.use(
		[`/${SWAGGER_ROUTE}`], // Định nghĩa route Swagger cần bảo vệ
		basicAuth({
			users: { [username]: password }, // Config username & password
			challenge: true, // Hiển thị cửa sổ đăng nhập trên trình duyệt
			unauthorizedResponse: 'Unauthorized - Bạn không có quyền truy cập',
		}),
	);

	const config = new DocumentBuilder()
		.setTitle('AG Music Distribution Server API')
		.setDescription(
			'API documentation for AG Music Distribution Server - A platform for music distribution and streaming',
		)
		.setVersion('1.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'Bearer',
				bearerFormat: 'JWT',
				in: 'header',
			},
			'token',
		)
		.addSecurityRequirements('token')
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup(SWAGGER_ROUTE, app, document, {
		swaggerOptions: { persistAuthorization: true },
	});
};
