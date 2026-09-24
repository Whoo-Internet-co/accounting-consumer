/**
 * Direção contábil do lançamento derivada de tipo_operacao + valor.
 *
 * Regra (consumer mínimo funcional — não é um ledger contábil completo):
 * - tipo_operacao presente (vocabulário do OpenAPI authorization v1):
 *   - DEBITO, RESERVA  -> DEBIT  (débito/reserva sobre o saldo do contrato)
 *   - CREDITO, ESTORNO -> CREDIT (crédito/devolução ao contrato)
 *   - valor desconhecido -> UnsupportedOperationTypeError (não ACK; DLQ)
 * - tipo_operacao ausente/nulo:
 *   - valor > 0  -> DEBIT (compra autorizada debita o contrato)
 *   - valor < 0  -> CREDIT (defensivo; schema v1 exige valor > 0)
 */
export const ENTRY_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;

export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

const DEBIT_OPERATION_TYPES: ReadonlySet<string> = new Set(['DEBITO', 'RESERVA']);
const CREDIT_OPERATION_TYPES: ReadonlySet<string> = new Set(['CREDITO', 'ESTORNO']);

export class UnsupportedOperationTypeError extends Error {
  constructor(tipoOperacao: string) {
    super(`Unsupported tipo_operacao for accounting entry: ${tipoOperacao}`);
    this.name = 'UnsupportedOperationTypeError';
  }
}

export function isEntryDirection(value: string): value is EntryDirection {
  return ENTRY_DIRECTIONS.includes(value as EntryDirection);
}

export function deriveEntryDirection(
  tipoOperacao: string | null | undefined,
  valor: number,
): EntryDirection {
  if (typeof tipoOperacao === 'string' && tipoOperacao.trim().length > 0) {
    const normalized = tipoOperacao.trim().toUpperCase();
    if (DEBIT_OPERATION_TYPES.has(normalized)) {
      return 'DEBIT';
    }
    if (CREDIT_OPERATION_TYPES.has(normalized)) {
      return 'CREDIT';
    }
    throw new UnsupportedOperationTypeError(tipoOperacao);
  }

  return valor < 0 ? 'CREDIT' : 'DEBIT';
}
