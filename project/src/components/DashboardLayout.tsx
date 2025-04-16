import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, Users, Globe } from 'lucide-react';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  if (!user?.roles.includes('ADMIN')) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex">
              <button
                onClick={() => navigate('/')}
                className="flex items-center px-3 py-2 text-gray-700 hover:text-gray-900"
              >
                <Home className="h-5 w-5 mr-1" />
                Home
              </button>
              <button
                onClick={() => navigate('/users')}
                className="flex items-center px-3 py-2 text-gray-700 hover:text-gray-900"
              >
                <Users className="h-5 w-5 mr-1" />
                Users
              </button>
              <button
                onClick={() => navigate('/worlds')}
                className="flex items-center px-3 py-2 text-gray-700 hover:text-gray-900"
              >
                <Globe className="h-5 w-5 mr-1" />
                Worlds
              </button>
            </div>
            <button
              onClick={logout}
              className="flex items-center px-3 py-2 text-gray-700 hover:text-gray-900"
            >
              <LogOut className="h-5 w-5 mr-1" />
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}