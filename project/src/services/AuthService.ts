import { logger } from "../utils/logger";
import {
  AuthError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRefreshError,
  UserNotFoundError,
  NetworkError,
  ServerError,
  ValidationError
} from "../types/AuthErrors";

interface LoginResponse {
  token: string;
  user: {
    _id: string;
    email: string;
    roles: string[];
    fullName: string;
    isEnabled: boolean;
  };
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000,    // 10 seconds
  backoffFactor: 2,   // Double the delay each retry
};

export class AuthService {
  private static instance: AuthService;
  private apiUrl: string;
  private refreshTimeout: NodeJS.Timeout | null = null;
  private readonly TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before token expires
  private retryConfig: RetryConfig;

  private constructor() {
    this.apiUrl = import.meta.env.VITE_GRAPHQL_API_URL;
    this.retryConfig = DEFAULT_RETRY_CONFIG;
    logger.debug('[AuthService.constructor] Service initialized', { 
      apiUrl: this.apiUrl, 
      retryConfig: this.retryConfig 
    });
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryConfig: RetryConfig = this.retryConfig
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = retryConfig.initialDelay;

    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry for certain errors
        if (
          error instanceof InvalidCredentialsError ||
          error instanceof TokenExpiredError ||
          error instanceof TokenInvalidError ||
          error instanceof ValidationError
        ) {
          throw error;
        }

        if (attempt < retryConfig.maxRetries) {
          logger.warn(`[AuthService.retryWithBackoff] ${operationName} attempt ${attempt} failed, retrying in ${delay}ms`, {
            error: lastError.message,
            attempt,
            maxRetries: retryConfig.maxRetries,
            delay
          });

          await this.sleep(delay);
          delay = Math.min(delay * retryConfig.backoffFactor, retryConfig.maxDelay);
        }
      }
    }

    logger.error(`[AuthService.retryWithBackoff] ${operationName} failed after ${retryConfig.maxRetries} attempts`, {
      error: lastError?.message,
      maxRetries: retryConfig.maxRetries
    });
    throw lastError;
  }

  private validateCredentials(username: string, password: string): void {
    logger.debug('[AuthService.validateCredentials] Validating credentials', { 
      usernameLength: username.length, 
      passwordLength: password.length 
    });
    if (!username || username.length < 3) {
      throw new ValidationError("Username must be at least 3 characters long");
    }
    if (!password || password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters long");
    }
  }

  private getHeaders(token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Bundle': 'security',
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (token) {
      headers['Bluelibs-Token'] = token;
    }

    logger.debug('[AuthService.getHeaders] Generated headers', { 
      headers: { ...headers, 'Bluelibs-Token': token ? '[REDACTED]' : undefined } 
    });
    return headers;
  }

  private async handleGraphQLError(response: Response, operation: string) {
    logger.debug(`[AuthService.handleGraphQLError] ${operation} response status`, { 
      status: response.status 
    });
    
    if (!response.ok) {
      try {
        const errorText = await response.text();
        logger.warn(`[AuthService.handleGraphQLError] ${operation} failed with status`, { 
          status: response.status, 
          error: errorText,
          operation,
          url: response.url,
          headers: Object.fromEntries(response.headers.entries())
        });

        if (response.status === 401) {
          throw new TokenInvalidError(`${operation} failed: ${response.status} ${errorText}`);
        } else if (response.status === 404) {
          throw new UserNotFoundError(`${operation} failed: ${response.status} ${errorText}`);
        } else if (response.status >= 500) {
          throw new ServerError(`${operation} failed: ${response.status} ${errorText}`);
        } else {
          throw new NetworkError(`${operation} failed: ${response.status} ${errorText}`);
        }
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        throw new NetworkError(`Failed to read error response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    try {
      const responseData = await response.json();
      if (responseData.errors) {
        logger.warn(`[AuthService.handleGraphQLError] ${operation} failed with GraphQL errors`, { 
          errors: responseData.errors,
          operation,
          url: response.url
        });

        const error = responseData.errors[0];
        if (error.message.includes('expired')) {
          throw new TokenExpiredError(error.message);
        } else if (error.message.includes('invalid')) {
          throw new TokenInvalidError(error.message);
        } else if (error.message.includes('credentials')) {
          throw new InvalidCredentialsError(error.message);
        } else {
          throw new AuthError(error.message);
        }
      }
      return responseData;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new NetworkError(`Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fetchUser(token: string) {
    return this.retryWithBackoff(async () => {
      logger.debug('[AuthService.fetchUser] Fetching user data', { 
        token: '[REDACTED]' 
      });
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          operationName: 'Me',
          query: `
            query Me {
              me {
                _id
                email
                roles
                fullName
                isEnabled
              }
            }
          `,
        }),
      });

      const responseData = await this.handleGraphQLError(response, "Fetch user data");
      
      if (!responseData?.data?.me) {
        logger.warn('[AuthService.fetchUser] No user data received', { 
          response: responseData 
        });
        throw new UserNotFoundError("No user data received");
      }

      const userData = responseData.data.me;
      
      // Validate required fields
      if (!userData._id || !userData.email) {
        logger.warn('[AuthService.fetchUser] User data missing required fields', { 
          hasId: !!userData._id,
          hasEmail: !!userData.email
        });
        throw new UserNotFoundError("User data missing required fields");
      }

      // Process roles
      const roles = Array.isArray(userData.roles) 
        ? userData.roles.filter(Boolean)
        : [];

      // Set default values for optional fields
      const user = {
        _id: userData._id,
        email: userData.email,
        roles,
        fullName: userData.fullName || '',
        isEnabled: userData.isEnabled ?? true
      };

      logger.debug('[AuthService.fetchUser] User data fetched successfully', { 
        userId: user._id,
        hasFullName: !!user.fullName,
        isEnabled: user.isEnabled,
        roleCount: user.roles.length
      });
      
      return user;
    }, 'Fetch user data');
  }

  private async refreshToken(currentToken: string): Promise<string> {
    return this.retryWithBackoff(async () => {
      try {
        logger.debug('[AuthService.refreshToken] Attempting token refresh', { 
          currentToken: '[REDACTED]' 
        });
        
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(currentToken),
          body: JSON.stringify({
            operationName: 'RefreshToken',
            query: `
              mutation RefreshToken {
                refreshToken {
                  token
                }
              }
            `,
          }),
        });

        const responseData = await this.handleGraphQLError(response, "Token refresh");

        if (!responseData?.data?.refreshToken?.token) {
          logger.warn('[AuthService.refreshToken] No token received from refresh', { 
            response: responseData 
          });
          throw new TokenRefreshError("No token received from refresh");
        }

        const { token } = responseData.data.refreshToken;
        
        logger.debug('[AuthService.refreshToken] Token refresh successful', { 
          newToken: '[REDACTED]'
        });
        
        return token;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        logger.error('[AuthService.refreshToken] Token refresh failed', { 
          error, 
          currentToken: '[REDACTED]' 
        });
        throw new TokenRefreshError(error instanceof Error ? error.message : 'Unknown error during token refresh');
      }
    }, 'Refresh token');
  }

  private scheduleTokenRefresh(token: string) {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    logger.debug('Scheduling token refresh', { 
      refreshIn: this.TOKEN_REFRESH_THRESHOLD,
      currentToken: '[REDACTED]'
    });

    this.refreshTimeout = setTimeout(async () => {
      try {
        const newToken = await this.refreshToken(token);
        localStorage.setItem('authToken', newToken);
        logger.debug('Token refreshed and stored', { newToken: '[REDACTED]' });
      } catch (error) {
        logger.error("Failed to refresh token", { error, currentToken: '[REDACTED]' });
        if (error instanceof TokenExpiredError || error instanceof TokenInvalidError) {
          // Handle token expiration/invalidation by logging out
          localStorage.removeItem('authToken');
        }
      }
    }, this.TOKEN_REFRESH_THRESHOLD);
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    return this.retryWithBackoff(async () => {
      try {
        logger.debug('[AuthService.login] Login attempt started', { 
          username 
        });
        this.validateCredentials(username, password);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            operationName: 'Login',
            query: `
              mutation Login($input: LoginInput!) {
                login(input: $input) {
                  token
                }
              }
            `,
            variables: {
              input: {
                username,
                password,
              }
            }
          }),
        });

        const responseData = await this.handleGraphQLError(response, "Login");

        if (!responseData?.data?.login?.token) {
          logger.warn('[AuthService.login] Login failed: No token received', { 
            response: responseData 
          });
          throw new InvalidCredentialsError("Authentication failed");
        }

        const token = responseData.data.login.token;
        const user = await this.fetchUser(token);

        this.scheduleTokenRefresh(token);

        logger.debug('[AuthService.login] Login successful', { 
          userId: user._id,
          token: '[REDACTED]',
          roleCount: user.roles.length
        });
        
        return {
          token,
          user,
        };
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        logger.error('[AuthService.login] Login error', { 
          error,
          username,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        throw new AuthError(error instanceof Error ? error.message : 'Unknown error during login');
      }
    }, 'Login');
  }

  async logout(token: string): Promise<void> {
    return this.retryWithBackoff(async () => {
      try {
        logger.debug('[AuthService.logout] Logout attempt started', { 
          token: '[REDACTED]' 
        });

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(token),
          body: JSON.stringify({
            operationName: 'Logout',
            query: `
              mutation Logout {
                logout
              }
            `,
          }),
        });

        await this.handleGraphQLError(response, "Logout");

        if (this.refreshTimeout) {
          clearTimeout(this.refreshTimeout);
          this.refreshTimeout = null;
        }

        logger.debug('[AuthService.logout] Logout successful', { 
          token: '[REDACTED]' 
        });
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        logger.error('[AuthService.logout] Logout error', { 
          error,
          token: '[REDACTED]',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        throw new AuthError(error instanceof Error ? error.message : 'Unknown error during logout');
      }
    }, 'Logout');
  }

  async validateToken(token: string): Promise<boolean> {
    return this.retryWithBackoff(async () => {
      try {
        logger.debug('[AuthService.validateToken] Validating token', { 
          token: '[REDACTED]' 
        });

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: this.getHeaders(token),
          body: JSON.stringify({
            operationName: 'ValidateToken',
            query: `
              query ValidateToken {
                validateToken
              }
            `,
          }),
        });

        const responseData = await this.handleGraphQLError(response, "Token validation");

        const isValid = responseData?.data?.validateToken === true;
        
        logger.debug('[AuthService.validateToken] Token validation result', { 
          isValid,
          token: '[REDACTED]'
        });
        
        return isValid;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        logger.error('[AuthService.validateToken] Token validation error', { 
          error,
          token: '[REDACTED]',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        throw new AuthError(error instanceof Error ? error.message : 'Unknown error during token validation');
      }
    }, 'Validate token');
  }
} 