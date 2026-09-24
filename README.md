# accounting-consumer

Consumidor **mínimo funcional** do bounded context de **Accounting** para eventos `TransacaoAutorizada v1` entregues via Amazon SQS (ADR-005/006/007/008).

> README completo na etapa de delivery. Este serviço valida o contrato oficial
> (`@whoo-internet-co/finance-platform-contracts`), deduplica por `event_id`,
> deriva um lançamento contábil (DEBIT/CREDIT) e o persiste via porta
> `AccountingLedger` — **não é um ledger contábil completo** (sem partidas
> dobradas, sem balanços, sem replay).

## Licença

MIT — ver [LICENSE](./LICENSE).
