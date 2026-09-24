/**
 * Evento de domínio derivado do contrato oficial TransacaoAutorizada v1
 * (source of truth: @whoo-internet-co/finance-platform-contracts, ADR-008).
 *
 * O domínio declara sua própria representação para não acoplar as camadas
 * internas ao package de contratos; a validação contra o schema oficial
 * ocorre na borda (adapters/inbound/validation).
 */
export interface AuthorizedTransactionEvent {
  event_id: string;
  event_type: 'TransacaoAutorizada';
  event_version: string;
  occurred_at: string;
  id_autorizacao: string;
  id_contrato: string;
  valor: number;
  saldo_reservado: number;
  correlation_id: string;
  trace_id: string | null;
  /**
   * Campo adicional opcional tolerado pelo schema (additionalProperties: true).
   * Vocabulário derivado do OpenAPI authorization v1: DEBITO | CREDITO |
   * RESERVA | ESTORNO. Quando ausente, a direção do lançamento é derivada
   * do valor.
   */
  tipo_operacao?: string | null;
}
