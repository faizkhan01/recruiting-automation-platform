import pino, { type DestinationStream } from 'pino';
import { config } from '../config.js';

const messageOnlyStream: DestinationStream = {
  write(line) {
    try {
      const log = JSON.parse(line) as { msg?: string };
      process.stdout.write(`${log.msg ?? line.trim()}\n`);
    } catch {
      process.stdout.write(line);
    }
  }
};

const options: pino.LoggerOptions = {
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', '*.apiKey', '*.GEMINI_API_KEY', '*.SERPER_API_KEY'],
    censor: '[REDACTED]'
  }
};

export const logger =
  config.NODE_ENV === 'production' ? pino(options) : pino(options, messageOnlyStream);
