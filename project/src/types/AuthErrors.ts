export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = 'Invalid username or password') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Authentication token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends AuthError {
  constructor(message: string = 'Invalid authentication token') {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

export class TokenRefreshError extends AuthError {
  constructor(message: string = 'Failed to refresh authentication token') {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message: string = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class NetworkError extends AuthError {
  constructor(message: string = 'Network error occurred during authentication') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ServerError extends AuthError {
  constructor(message: string = 'Server error occurred during authentication') {
    super(message);
    this.name = 'ServerError';
  }
}

export class ValidationError extends AuthError {
  constructor(message: string = 'Invalid input provided') {
    super(message);
    this.name = 'ValidationError';
  }
} 