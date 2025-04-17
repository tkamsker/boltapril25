import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '../types/auth';
import { logger } from '../utils/logger';
import { AuthService } from '../services/AuthService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const authService = AuthService.getInstance();

  useEffect(() => {
    // Check for existing token in localStorage
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      authService.validateToken(storedToken).then(isValid => {
        if (isValid) {
          setToken(storedToken);
          // Fetch user data using the token
          fetch(import.meta.env.VITE_GRAPHQL_API_URL, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Bluelibs-Token': storedToken
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
          })
          .then(response => response.json())
          .then(data => {
            if (data.data?.UsersFindOne) {
              setUser(data.data.UsersFindOne);
            }
          })
          .catch(error => {
            logger.error('AuthProvider -> Failed to fetch user data', error);
            localStorage.removeItem('authToken');
          });
        } else {
          localStorage.removeItem('authToken');
        }
      });
    }
  }, []);

  // Listen for token refresh events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'authToken' && e.newValue) {
        setToken(e.newValue);
        logger.info('AuthProvider-useffect->Token updated from storage event');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const { token: newToken, user: newUser } = await authService.login(username, password);
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('authToken', newToken);
    } catch (error) {
      logger.error('Login->Login error', error);
      setToken(null);
      setUser(null);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await authService.logout(token);
      }
      setToken(null);
      setUser(null);
      localStorage.removeItem('authToken');
      logger.info('Logout-> User logged out');
    } catch (error) {
      logger.error('Logout-Error-> Logout error', error);
      throw error;
    }
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
    logger.error('useAuth-> useAuth must be used within an AuthProvider');
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};