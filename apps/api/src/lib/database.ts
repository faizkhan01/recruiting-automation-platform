import mongoose from 'mongoose';
import { config } from '../config.js';
import { logger } from './logger.js';

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(config.MONGODB_URI);
  logger.info('MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

