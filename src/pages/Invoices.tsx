import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Plus, FileText, Calendar, DollarSign } from 'lucide-react';

interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
}

interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issueDate: string;
  dueDate: string;
  items: string; // JSON stringified array of items
}

interface Client {
  id: string;
  name: string;
}

export default function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [newInvoice, setNewInvoice] = useState({
    clientId: '',
    clientName: '',
    status: 'draft',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ description: '', quantity: 1, price: 0 }]
  });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'invoices'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(invoicesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    // Fetch clients for the dropdown
    const fetchClients = async () => {
      try {
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        const clientsData = clientsSnapshot.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            name: data.businessName || data.name || 'Unknown Client' 
          };
        });
        setClients(clientsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'clients');
      }
    };
    fetchClients();

    return () => unsubscribe();
  }, [user]);

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const amount = newInvoice.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      const selectedClient = clients.find(c => c.id === newInvoice.clientId);
      
      if (!selectedClient) {
        alert("Please select a valid client.");
        return;
      }

      await addDoc(collection(db, 'invoices'), {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        amount,
        status: newInvoice.status,
        issueDate: newInvoice.issueDate,
        dueDate: newInvoice.dueDate,
        items: JSON.stringify(newInvoice.items),
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      setIsModalOpen(false);
      setNewInvoice({
        clientId: '',
        clientName: '',
        status: 'draft',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [{ description: '', quantity: 1, price: 0 }]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updatedItems = [...newInvoice.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setNewInvoice({ ...newInvoice, items: updatedItems });
  };

  const addItemRow = () => {
    setNewInvoice({
      ...newInvoice,
      items: [...newInvoice.items, { description: '', quantity: 1, price: 0 }]
    });
  };

  const removeItemRow = (index: number) => {
    const updatedItems = newInvoice.items.filter((_, i) => i !== index);
    setNewInvoice({ ...newInvoice, items: updatedItems });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-emerald-100 text-emerald-700';
      case 'overdue': return 'bg-rose-100 text-rose-700';
      case 'sent': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Create Invoice</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <th className="p-4 font-medium">Invoice ID</th>
              <th className="p-4 font-medium">Client</th>
              <th className="p-4 font-medium">Amount</th>
              <th className="p-4 font-medium">Dates</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="p-4 font-mono text-sm text-slate-500">
                  <div className="flex items-center">
                    <FileText size={16} className="mr-2 text-slate-400" />
                    {invoice.id.substring(0, 8).toUpperCase()}
                  </div>
                </td>
                <td className="p-4 font-medium text-slate-900">{invoice.clientName}</td>
                <td className="p-4 font-bold text-slate-900">
                  <div className="flex items-center">
                    <DollarSign size={16} className="text-slate-400" />
                    {invoice.amount.toLocaleString()}
                  </div>
                </td>
                <td className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-slate-600">
                      <Calendar size={14} className="mr-2" /> Issued: {invoice.issueDate}
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <Calendar size={14} className="mr-2" /> Due: {invoice.dueDate}
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">No invoices found. Create one to get started.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-2xl w-full my-auto">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Invoice</h2>
            <form onSubmit={handleAddInvoice} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                  <select required value={newInvoice.clientId} onChange={e => setNewInvoice({...newInvoice, clientId: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                    <option value="" disabled>Select a client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select value={newInvoice.status} onChange={e => setNewInvoice({...newInvoice, status: e.target.value as any})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date *</label>
                  <input required type="date" value={newInvoice.issueDate} onChange={e => setNewInvoice({...newInvoice, issueDate: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date *</label>
                  <input required type="date" value={newInvoice.dueDate} onChange={e => setNewInvoice({...newInvoice, dueDate: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">Line Items</label>
                  <button type="button" onClick={addItemRow} className="text-sm text-indigo-600 font-medium hover:text-indigo-700">+ Add Item</button>
                </div>
                <div className="space-y-3">
                  {newInvoice.items.map((item, index) => (
                    <div key={index} className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="flex-1">
                        <input required type="text" placeholder="Description" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div className="w-24">
                        <input required type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div className="w-32">
                        <input required type="number" min="0" step="0.01" placeholder="Price" value={item.price} onChange={e => handleItemChange(index, 'price', Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      {newInvoice.items.length > 1 && (
                        <button type="button" onClick={() => removeItemRow(index)} className="text-rose-500 hover:text-rose-700 p-2">
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-right">
                  <span className="text-sm text-slate-500 mr-4">Total:</span>
                  <span className="text-xl font-bold text-slate-900">
                    ${newInvoice.items.reduce((sum, item) => sum + (item.quantity * item.price), 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">Save Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
