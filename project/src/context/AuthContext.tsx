import React, { createContext, useContext, useState } from 'react';
import { User, AuthContextType } from '../types/auth';
import { logger } from '../utils/logger';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const login = async (email: string, password: string) => {
    try {
      logger.info('Attempting login', { email });
      
      // First, authenticate with BlueLibs
      const authResponse = await fetch(`${import.meta.env.VITE_GRAPHQL_API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const authData = await authResponse.json();
      if (!authData.token) {
        logger.warn('Login failed: No token received');
        throw new Error('Authentication failed');
      }

      setToken(authData.token);

      // Now fetch user data with the token
      const response = await fetch(import.meta.env.VITE_GRAPHQL_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.token}`
        },
        body: JSON.stringify({
          query: `
            query UsersFindOne {
              UsersFindOne {
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

      const data = await response.json();
      if (data.data?.UsersFindOne) {
        logger.info('Login successful', { userId: data.data.UsersFindOne._id });
        setUser(data.data.UsersFindOne);
      } else {
        logger.warn('Login failed: Invalid credentials');
        throw new Error('Invalid credentials');
      }
    } catch (error) {
      logger.error('Login error', error);
      setToken(null);
      throw new Error('Login failed');
    }
  };

  const logout = () => {
    logger.info('User logged out');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isAuthenticated: !!user,
      token 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    logger.error('useAuth must be used within an AuthProvider');
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};