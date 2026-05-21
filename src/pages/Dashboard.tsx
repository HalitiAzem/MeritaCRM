import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Users, FileText, Receipt, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    activeClients: 0,
    totalInvoices: 0,
    totalExpenses: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const clientsUnsub = onSnapshot(
      query(collection(db, 'clients'), where('status', '==', 'active')),
      (snapshot) => {
        setStats(prev => ({ ...prev, activeClients: snapshot.size }));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    const invoicesUnsub = onSnapshot(
      collection(db, 'invoices'),
      (snapshot) => {
        let revenue = 0;
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.status === 'paid') {
            revenue += data.amount;
          }
        });
        setStats(prev => ({ ...prev, totalInvoices: snapshot.size, revenue }));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'invoices')
    );

    const expensesUnsub = onSnapshot(
      collection(db, 'expenses'),
      (snapshot) => {
        let totalExpenses = 0;
        snapshot.docs.forEach(doc => {
          totalExpenses += doc.data().amount;
        });
        setStats(prev => ({ ...prev, totalExpenses }));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'expenses')
    );

    return () => {
      clientsUnsub();
      invoicesUnsub();
      expensesUnsub();
    };
  }, [user]);

  if (loading) return <div className="text-slate-500">Loading dashboard...</div>;

  const chartData = [
    { name: 'Revenue', amount: stats.revenue },
    { name: 'Expenses', amount: stats.totalExpenses },
    { name: 'Profit', amount: stats.revenue - stats.totalExpenses },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Clients</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.activeClients}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Users size={24} />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Invoices</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats.totalInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <FileText size={24} />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Revenue</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">${stats.revenue.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Expenses</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">${stats.totalExpenses.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
              <Receipt size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Financial Overview</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
              <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => `$${value}`} />
              <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
