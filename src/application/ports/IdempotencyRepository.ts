/**
 * Deduplicação por event_id (ADR-004/ADR-007).
 * hasBeenProcessed: consulta prévia; markAsProcessed: registrado SOMENTE após
 * o efeito de negócio (lançamento contábil) concluir com sucesso.
 */
export interface IdempotencyRepository {
  hasBeenProcessed(eventId: string): Promise<boolean>;
  markAsProcessed(eventId: string): Promise<void>;
}
