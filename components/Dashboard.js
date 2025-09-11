import { useState, useEffect } from 'react';
import { useAuth } from '../lib/hooks/useAuth';
import { useBlinkWebSocket } from '../lib/hooks/useBlinkWebSocket';
import PaymentAnimation from './PaymentAnimation';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [apiKey, setApiKey] = useState(null);
  
  // Get user's API key for direct WebSocket connection
  useEffect(() => {
    if (user) {
      // Get the API key from local storage or make an API call
      fetchApiKey();
    }
  }, [user]);

  const fetchApiKey = async () => {
    try {
      const response = await fetch('/api/auth/get-api-key');
      if (response.ok) {
        const data = await response.json();
        setApiKey(data.apiKey);
      }
    } catch (error) {
      console.error('Failed to get API key:', error);
    }
  };

  // Use direct Blink WebSocket connection (like the donation button)
  const { connected, lastPayment, showAnimation, hideAnimation } = useBlinkWebSocket(apiKey, user?.username);
  
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch initial data
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Refresh data when payment received
  useEffect(() => {
    if (lastPayment) {
      // Small delay to ensure transaction is processed
      setTimeout(() => {
        fetchData();
      }, 1000);
    }
  }, [lastPayment]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch balance and transactions in parallel
      const [balanceRes, transactionsRes] = await Promise.all([
        fetch('/api/blink/balance'),
        fetch('/api/blink/transactions?first=20')
      ]);

      if (balanceRes.ok && transactionsRes.ok) {
        const balanceData = await balanceRes.json();
        const transactionsData = await transactionsRes.json();
        
        setBalance(balanceData.wallets);
        setTransactions(transactionsData.transactions);
        setError('');
      } else {
        throw new Error('Failed to fetch data');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  const handleLogout = () => {
    logout();
  };

  if (loading && !balance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-orange mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your wallet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Payment Animation Overlay */}
      <PaymentAnimation 
        show={showAnimation} 
        payment={lastPayment}
        onHide={hideAnimation}
      />

      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-6">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Blink Balance Tracker V2
              </h1>
              <p className="text-sm text-gray-500">Welcome, {user?.username}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
              {/* Connection Status */}
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {/* Buttons */}
              <div className="flex space-x-2 w-full sm:w-auto">
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex-1 sm:flex-none"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex-1 sm:flex-none"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Wallet Balances */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Wallet Balances</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {balance?.map((wallet) => (
              <div key={wallet.id} className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blink-orange rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {wallet.currency === 'BTC' ? '₿' : wallet.currency.charAt(0)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">
                        {wallet.currency} Balance
                      </p>
                      <p className="text-2xl font-bold text-gray-900">
                        {wallet.formattedBalance}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Recent Transactions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Most Recent Transactions</h2>
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {transactions.slice(0, 5).map((tx) => (
                <li key={tx.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mr-3 ${
                        tx.direction === 'RECEIVE' ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {tx.amount}
                        </p>
                        <p className="text-sm text-gray-500">{tx.memo}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{tx.status}</p>
                      <p className="text-sm text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Past Transactions */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Past Transactions</h2>
          
          {/* Mobile-friendly card layout for small screens */}
          <div className="block sm:hidden">
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-white shadow rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-lg font-medium ${
                      tx.direction === 'RECEIVE' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.amount}
                    </span>
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {tx.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 mb-1">{tx.date}</div>
                  {tx.memo && <div className="text-sm text-gray-500">{tx.memo}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Desktop table layout for larger screens */}
          <div className="hidden sm:block bg-white shadow overflow-hidden sm:rounded-md">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Memo
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          tx.direction === 'RECEIVE' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.amount}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tx.date}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {tx.memo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
