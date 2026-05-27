/**
 * Typed authorisation errors. Every `require*` helper throws one of these on
 * failure and the route handler converts them to standard envelope responses
 * via `failFromError` from `@/lib/http/response`.
 */

export class AuthzError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

export class NotSignedInError extends AuthzError {
  constructor(message = "Not signed in") {
    super(401, message);
    this.name = "NotSignedInError";
  }
}

export class NotAuthorisedError extends AuthzError {
  constructor(message = "Not authorised") {
    super(403, message);
    this.name = "NotAuthorisedError";
  }
}

export class LeagueNotVisibleError extends AuthzError {
  constructor(message = "League not found") {
    super(404, message);
    this.name = "LeagueNotVisibleError";
  }
}

export class LeagueSuspendedError extends AuthzError {
  constructor(message = "This league is suspended") {
    super(403, message);
    this.name = "LeagueSuspendedError";
  }
}
