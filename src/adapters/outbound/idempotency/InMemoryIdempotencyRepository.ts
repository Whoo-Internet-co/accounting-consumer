import type { IdempotencyRepository } from '../../../application/ports/IdempotencyRepository.js';

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly processedEventIds = new Set<string>();

  async hasBeenProcessed(eventId: string): Promise<boolean> {
    return this.processedEventIds.has(eventId);
  }

  async markAsProcessed(eventId: string): Promise<void> {
    this.processedEventIds.add(eventId);
  }
}
