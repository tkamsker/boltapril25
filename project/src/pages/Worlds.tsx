import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { logger } from '../utils/logger';
import { useAuth } from '../context/AuthContext';

interface World {
  _id: string;
  name: { text: string };
  description?: { text: string };
  createdAt: string;
  projectsCount: number;
}

export function WorldsPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    const fetchWorlds = async () => {
      try {
        logger.debug('Fetching worlds data');
        const response = await fetch(import.meta.env.VITE_GRAPHQL_API_URL, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query: `
              query WorldsFindOne {
                WorldsFindOne {
                  _id
                  name {
                    text
                  }
                  description {
                    text
                  }
                  createdAt
                  projectsCount
                }
              }
            `,
          }),
        });

        const data = await response.json();
        if (data.data?.WorldsFindOne) {
          logger.info('Successfully fetched worlds data', { worldCount: 1 });
          setWorlds([data.data.WorldsFindOne]);
        }
        setLoading(false);
      } catch (err) {
        logger.error('Failed to fetch worlds', err);
        setError('Failed to fetch worlds');
        setLoading(false);
      }
    };

    if (token) {
      fetchWorlds();
    }
  }, [token]);

  if (loading) {
    logger.debug('Rendering loading state');
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    logger.warn('Rendering error state', { error });
    return (
      <DashboardLayout>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </DashboardLayout>
    );
  }

  logger.debug('Rendering worlds table', { worldCount: worlds.length });
  return (
    <DashboardLayout>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Worlds</h3>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Projects
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {worlds.map((world) => (
                <tr key={world._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {world.name.text}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {world.description?.text || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {world.projectsCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(world.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}