import type { AccountingEntry } from '../../domain/entities/AccountingEntry.js';

export interface EventProcessorResult {
  status: 'PROCESSED' | 'DUPLICATE_EVENT';
  entry?: AccountingEntry;
}

export interface EventProcessor {
  execute(input: unknown): Promise<EventProcessorResult>;
}
