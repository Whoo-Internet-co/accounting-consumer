import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonConsoleLogger } from '../../src/adapters/outbound/logging/JsonConsoleLogger.js';

describe('JsonConsoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info serializa JSON estruturado no stdout', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new JsonConsoleLogger('accounting-consumer');

    logger.info('Accounting entry recorded', { event_id: 'e1', direction: 'DEBIT' });

    expect(log).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(log.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({
      level: 'INFO',
      service: 'accounting-consumer',
      message: 'Accounting entry recorded',
      event_id: 'e1',
      direction: 'DEBIT',
    });
    expect(Number.isNaN(Date.parse(parsed.timestamp))).toBe(false);
  });

  it('error serializa JSON estruturado no stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new JsonConsoleLogger('accounting-consumer');

    logger.error('Event processing failed', { processing_status: 'PROCESSING_FAILED' });

    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toMatchObject({
      level: 'ERROR',
      service: 'accounting-consumer',
      message: 'Event processing failed',
      processing_status: 'PROCESSING_FAILED',
    });
  });

  it('fields são opcionais', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    new JsonConsoleLogger('svc').info('hello');

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      level: 'INFO',
      service: 'svc',
      message: 'hello',
    });
  });
});
