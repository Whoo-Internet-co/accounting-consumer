import type { AuthorizedTransactionEvent } from '../../domain/entities/AuthorizedTransactionEvent.js';

/**
 * Valida o payload contra o contrato oficial TransacaoAutorizada v1.
 * Assíncrona porque o schema canônico é carregado do package
 * @whoo-internet-co/finance-platform-contracts (ADR-008).
 */
export interface EventValidator {
  validate(input: unknown): Promise<AuthorizedTransactionEvent>;
}
