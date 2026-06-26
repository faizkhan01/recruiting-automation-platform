import { config } from '../../config.js';
import { DemoSourcingProvider } from './demo.provider.js';
import { SerperSourcingProvider } from './serper.provider.js';
import type { SourcingProvider } from './sourcing.types.js';

export function getSourcingProvider(): SourcingProvider {
  return config.SOURCING_PROVIDER === 'serper'
    ? new SerperSourcingProvider()
    : new DemoSourcingProvider();
}

export * from './sourcing.types.js';

