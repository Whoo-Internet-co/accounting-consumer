export interface MessageBodyParser {
  parse(body: string): unknown;
}
