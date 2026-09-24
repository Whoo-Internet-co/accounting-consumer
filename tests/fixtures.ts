/**
 * Fixture canônica de um evento TransacaoAutorizada v1 válido.
 * event_id usa UUID real porque o schema oficial aplica `format: uuid`.
 */
export function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: '550e8400-e29b-41d4-a716-446655440000',
    event_type: 'TransacaoAutorizada',
    event_version: '1.0',
    occurred_at: '2026-09-23T20:00:00Z',
    id_autorizacao: 'AUT-001',
    id_contrato: 'CTR-001',
    valor: 100,
    saldo_reservado: 900,
    correlation_id: 'CORR-001',
    trace_id: null,
    ...overrides,
  };
}

export const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

export function eventBridgeEnvelope(detail: Record<string, unknown>): Record<string, unknown> {
  return {
    version: '0',
    id: 'envelope-1',
    source: 'authorization-service',
    account: '123456789012',
    time: '2026-09-23T20:00:01Z',
    region: 'us-east-1',
    resources: [],
    'detail-type': 'TransacaoAutorizada',
    detail,
  };
}
