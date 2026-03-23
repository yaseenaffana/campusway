import { Edit2, Save, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { getApiUrl } from '../services/api';

const API_URL = getApiUrl();

interface Driver {
  Id: number;
  DriverName: string;
  BusNumber: string;
  Registration: string;
}

const DriverManagement: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Driver>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/drivers`);
      if (!response.ok) throw new Error('Failed to fetch drivers');
      const data = await response.json();
      setDrivers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const updateDriver = async (id: number, updates: Partial<Driver>) => {
    try {
      const response = await fetch(`${API_URL}/api/drivers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update driver');
      await fetchDrivers(); // Refresh list
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const startEdit = (driver: Driver) => {
    setEditingId(driver.Id);
    setEditForm({ ...driver });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingId && editForm.DriverName && editForm.BusNumber) {
      updateDriver(editingId, editForm);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  if (loading) return <div className="p-4">Loading drivers...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Driver Management</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Driver Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bus Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Registration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {drivers.map((driver) => (
              <tr key={driver.Id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === driver.Id ? (
                    <input
                      type="text"
                      value={editForm.DriverName || ''}
                      onChange={(e) => setEditForm({ ...editForm, DriverName: e.target.value })}
                      className="border rounded px-2 py-1 w-full"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900">{driver.DriverName}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === driver.Id ? (
                    <input
                      type="text"
                      value={editForm.BusNumber || ''}
                      onChange={(e) => setEditForm({ ...editForm, BusNumber: e.target.value })}
                      className="border rounded px-2 py-1 w-full"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{driver.BusNumber}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === driver.Id ? (
                    <input
                      type="text"
                      value={editForm.Registration || ''}
                      onChange={(e) => setEditForm({ ...editForm, Registration: e.target.value })}
                      className="border rounded px-2 py-1 w-full"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{driver.Registration}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {editingId === driver.Id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={saveEdit}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-red-600 hover:text-red-900"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(driver)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverManagement;
