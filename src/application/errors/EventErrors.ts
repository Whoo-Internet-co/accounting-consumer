export class InvalidEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventError';
  }
}

export class UnsupportedEventTypeError extends InvalidEventError {
  constructor(eventType: string) {
    super(`Unsupported event_type: ${eventType}`);
    this.name = 'UnsupportedEventTypeError';
  }
}

export class IncompatibleEventVersionError extends InvalidEventError {
  constructor(eventVersion: string) {
    super(`Incompatible event_version: ${eventVersion}`);
    this.name = 'IncompatibleEventVersionError';
  }
}

export class InvalidMessageBodyError extends InvalidEventError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageBodyError';
  }
}
