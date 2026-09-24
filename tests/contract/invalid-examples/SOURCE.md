# invalid-examples/ — proveniência

Cópias dos exemplos inválidos oficiais de
`finance-platform-contracts/events/transacao-autorizada/v1/invalid-examples/`
(source of truth, ADR-008), usadas nos consumer contract tests.

O package publicado `@whoo-internet-co/finance-platform-contracts` EXCLUI
explicitamente `events/**/invalid-examples` (campo `files` do package.json),
por isso os artefatos são mantidos aqui para os testes. O schema e o exemplo
válido oficiais são carregados do próprio package em tempo de teste — apenas
os casos inválidos vêm desta pasta.

Origem: Whoo-Internet-co/finance-platform-contracts@v1.0.1 (branch main).
