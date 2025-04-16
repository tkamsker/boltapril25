import { logger } from "../utils/logger";

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

export class AuthService {
  private static instance: AuthService;
  private apiUrl: string;

  private constructor() {
    this.apiUrl = import.meta.env.VITE_GRAPHQL_API_URL;
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private getHeaders(token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Bundle': 'security',
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      logger.info("Attempting login with BlueLibs", { email });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          operationName: 'Login',
          query: `
            mutation Login($input: LoginInput!) {
              login(input: $input) {
                token
                user {
                  _id
                  email
                  roles
                  fullName
                  isEnabled
                }
              }
            }
          `,
          variables: {
            input: {
              email,
              password,
              strategy: 'password', // Specify the authentication strategy
            }
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn("Login failed with status", { status: response.status, error: errorText });
        throw new Error(`Login failed: ${response.status} ${errorText}`);
      }

      const { data, errors } = await response.json();

      if (errors) {
        logger.warn("Login failed with GraphQL errors", { errors });
        throw new Error(errors[0].message);
      }

      if (!data?.login?.token) {
        logger.warn("Login failed: No token received");
        throw new Error("Authentication failed");
      }

      logger.info("Login successful", { userId: data.login.user._id });
      return {
        token: data.login.token,
        user: data.login.user,
      };
    } catch (error) {
      logger.error("Login error", error);
      throw error;
    }
  }

  async logout(token: string): Promise<void> {
    try {
      logger.info("Attempting logout");

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

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn("Logout failed with status", { status: response.status, error: errorText });
        throw new Error(`Logout failed: ${response.status} ${errorText}`);
      }

      const { data, errors } = await response.json();

      if (errors) {
        logger.warn("Logout failed with GraphQL errors", { errors });
        throw new Error(errors[0].message);
      }

      logger.info("Logout successful");
    } catch (error) {
      logger.error("Logout error", error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<boolean> {
    try {
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

      if (!response.ok) {
        return false;
      }

      const { data, errors } = await response.json();

      if (errors) {
        return false;
      }

      return data?.validateToken === true;
    } catch (error) {
      logger.error("Token validation error", error);
      return false;
    }
  }
} 