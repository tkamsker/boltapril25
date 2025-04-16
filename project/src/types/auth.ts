export interface User {
  _id: string;
  email: string;
  roles: string[];
  fullName: string;
  isEnabled: boolean;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}