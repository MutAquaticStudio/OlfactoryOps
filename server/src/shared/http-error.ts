type ErrorPayload = string | Record<string, unknown>

export class AppHttpError extends Error {
  constructor(
    readonly statusCode: number,
    payload: ErrorPayload,
    readonly error = 'Error',
  ) {
    super(messageFromPayload(payload, error))
    this.name = error
    this.response = normalizePayload(payload, statusCode, error)
  }

  readonly response: Record<string, unknown>

  getStatus() {
    return this.statusCode
  }

  getResponse() {
    return this.response
  }
}

export class ForbiddenException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Forbidden') {
    super(403, payload, 'Forbidden')
  }
}

export class UnauthorizedException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Authentication required') {
    super(401, payload, 'Unauthorized')
  }
}

export class NotFoundException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Not found') {
    super(404, payload, 'Not Found')
  }
}

export class UnprocessableEntityException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Unprocessable entity') {
    super(422, payload, 'Unprocessable Entity')
  }
}

export class TooManyRequestsException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Too many requests') {
    super(429, payload, 'Too Many Requests')
  }
}

export class PayloadTooLargeException extends AppHttpError {
  constructor(payload: ErrorPayload = 'Payload too large') {
    super(413, payload, 'Payload Too Large')
  }
}

export function Injectable(): ClassDecorator {
  return () => undefined
}

export function isAppHttpError(error: unknown): error is AppHttpError {
  return error instanceof AppHttpError
}

function normalizePayload(payload: ErrorPayload, statusCode: number, error: string) {
  if (typeof payload === 'string') {
    return { statusCode, message: payload, error }
  }
  return {
    statusCode,
    error,
    ...payload,
    message: typeof payload.message === 'string' ? payload.message : error,
  }
}

function messageFromPayload(payload: ErrorPayload, fallback: string) {
  if (typeof payload === 'string') {
    return payload
  }
  return typeof payload.message === 'string' ? payload.message : fallback
}
