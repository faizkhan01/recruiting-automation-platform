import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { ZodError } from 'zod';
import { config } from './config.js';
import { openApiDocument } from './docs/openapi.js';
import { AppError, success } from './lib/http.js';
import { logger } from './lib/logger.js';
import { generalApiLimiter, writeApiLimiter } from './lib/rate-limit.js';
import { candidatesRouter } from './routes/candidates.routes.js';
import { jobsRouter } from './routes/jobs.routes.js';
import { tasksRouter } from './routes/tasks.routes.js';

export function createApp() {
  const app = express();
  if (config.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', config.TRUST_PROXY_HOPS);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:']
        }
      }
    })
  );
  app.use(cors({ origin: config.WEB_ORIGIN.split(',').map((origin) => origin.trim()) }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return config.NODE_ENV === 'production' ? 'info' : 'silent';
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url
        }),
        res: (res) => ({
          statusCode: res.statusCode
        }),
        err: pino.stdSerializers.err
      }
    })
  );

  app.get('/health', (_req, res) => {
    res.json(success({ status: 'ok', timestamp: new Date().toISOString() }));
  });
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Recruiting Automation Platform API Documentation',
      swaggerOptions: {
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true
      }
    })
  );
  app.get('/api', (_req, res) => {
    res.json(
      success({
        name: 'Recruiting Automation Platform API',
        message: 'API is running. Use the links below to explore available endpoints.',
        links: {
          health: '/health',
          documentation: '/api/docs',
          openApiJson: '/api/docs.json',
          jobs: '/api/jobs',
          candidates: '/api/candidates'
        }
      })
    );
  });
  app.use('/api', generalApiLimiter, writeApiLimiter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/candidates', candidatesRouter);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { message: 'Route not found' } });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: error.issues }
      });
      return;
    }
    if (error instanceof AppError) {
      const retryAfterSeconds =
        typeof error.details === 'object' &&
        error.details &&
        'retryAfterSeconds' in error.details
          ? Number((error.details as { retryAfterSeconds?: unknown }).retryAfterSeconds)
          : undefined;
      if (retryAfterSeconds && Number.isFinite(retryAfterSeconds)) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterSeconds)));
      }
      res.status(error.statusCode).json({
        success: false,
        error: { message: error.message, details: error.details }
      });
      return;
    }
    logger.error({ err: error }, 'Unhandled request error');
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  };
  app.use(errorHandler);
  return app;
}
