import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Plus, Mail, Phone, Building, Edit, Key, User as UserIcon, Briefcase, Search, Upload, Download, Tag, Copy, Check, Eye } from 'lucide-react';

const AVAILABLE_TAGS = [
  'Biznes I vogel', 'Biznes i madh', 'Biznese pasive', 
  'Biznese ambulante', 'Taxi'
];

interface Client {
  id: string;
  businessName: string;
  businessNipt: string;
  ownerName: string;
  email: string;
  emailPassword: string;
  password: string;
  phone: string;
  eAlbaniaPersonal: string;
  eAlbaniaPersonalPassword: string;
  eAlbaniaBusiness: string;
  eAlbaniaBusinessPassword: string;
  status: 'active' | 'inactive';
  tags: string[];
  propertyStatus?: string;
  paymentTax1?: string;
}

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const defaultClientState = { 
    businessName: '', 
    businessNipt: '', 
    ownerName: '', 
    email: '', 
    emailPassword: '',
    password: '',
    phone: '', 
    eAlbaniaPersonal: '',
    eAlbaniaPersonalPassword: '',
    eAlbaniaBusiness: '',
    eAlbaniaBusinessPassword: '',
    status: 'active' as const,
    tags: [] as string[],
    propertyStatus: '',
    paymentTax1: '',
  };
  
  const [formData, setFormData] = useState(defaultClientState);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'clients'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const clientsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          businessName: data.businessName || data.company || '',
          businessNipt: data.businessNipt || '',
          ownerName: data.ownerName || data.name || '',
          email: data.email || '',
          emailPassword: data.emailPassword || '',
          password: data.password || '',
          phone: data.phone || '',
          eAlbaniaPersonal: data.eAlbaniaPersonal || '',
          eAlbaniaPersonalPassword: data.eAlbaniaPersonalPassword || '',
          eAlbaniaBusiness: data.eAlbaniaBusiness || '',
          eAlbaniaBusinessPassword: data.eAlbaniaBusinessPassword || '',
          status: data.status || 'active',
          tags: data.tags || [],
          propertyStatus: data.propertyStatus || '',
          paymentTax1: data.paymentTax1 || '',
        } as Client;
      });
      setClients(clientsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'clients'));

    return () => unsubscribe();
  }, [user]);

  const openAddModal = () => {
    setFormData(defaultClientState);
    setEditingClient(null);
    setIsReadOnly(false);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client, readOnly: boolean = false) => {
    setFormData({
      businessName: client.businessName,
      businessNipt: client.businessNipt,
      ownerName: client.ownerName,
      email: client.email,
      emailPassword: client.emailPassword || '',
      password: client.password || '',
      phone: client.phone,
      eAlbaniaPersonal: client.eAlbaniaPersonal,
      eAlbaniaPersonalPassword: client.eAlbaniaPersonalPassword,
      eAlbaniaBusiness: client.eAlbaniaBusiness,
      eAlbaniaBusinessPassword: client.eAlbaniaBusinessPassword,
      status: client.status,
      tags: client.tags || [],
      propertyStatus: client.propertyStatus || '',
      paymentTax1: client.paymentTax1 || '',
    });
    setEditingClient(client);
    setIsReadOnly(readOnly);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingClient) {
        const clientRef = doc(db, 'clients', editingClient.id);
        
        // Use deleteField to remove old schema fields if they exist
        // This ensures the document complies with the new strict security rules
        const { deleteField } = await import('firebase/firestore');
        
        await updateDoc(clientRef, {
          ...formData,
          name: deleteField(),
          company: deleteField()
        });
      } else {
        await addDoc(collection(db, 'clients'), {
          ...formData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
      }
      setIsModalOpen(false);
      setFormData(defaultClientState);
      setEditingClient(null);
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validClients = [];
          
          for (const row of results.data as any[]) {
            // Flexible header mapping
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                if (row[key] !== undefined) return String(row[key]).trim();
              }
              return '';
            };

            const businessName = getVal(['SUBJEKTI', 'businessName', 'Company', 'company']);
            const ownerName = getVal(['Owner Name', 'ownerName', 'Name', 'name']);
            const email = getVal(['Email', 'email']);
            
            // Skip rows missing required fields (SUBJEKTI and Owner Name are still essential for identification)
            if (!businessName || !ownerName) {
              console.warn('Skipping row due to missing required fields (SUBJEKTI, Owner Name):', row);
              continue;
            }

            const statusVal = getVal(['Status', 'status']).toLowerCase();
            const status = statusVal === 'inactive' ? 'inactive' : 'active';

            validClients.push({
              businessName,
              businessNipt: getVal(['NIPTI', 'businessNipt', 'NIPT', 'nipt']),
              ownerName,
              email,
              emailPassword: getVal(['Email Password', 'emailPassword', 'Email password']),
              password: getVal(['Password', 'password']),
              phone: getVal(['Phone', 'phone']),
              eAlbaniaPersonal: getVal(['e-Albania Personal', 'eAlbaniaPersonal']),
              eAlbaniaPersonalPassword: getVal(['e-Albania Personal Password', 'eAlbaniaPersonalPassword']),
              eAlbaniaBusiness: getVal(['e-Albania Business', 'eAlbaniaBusiness']),
              eAlbaniaBusinessPassword: getVal(['e-Albania Business Password', 'eAlbaniaBusinessPassword']),
              status,
              tags: getVal(['Tags', 'tags', 'Kategoritë', 'kategori']).split(',').map(t => t.trim()).filter(Boolean),
              propertyStatus: getVal(['Property Status', 'propertyStatus', 'Statusi i Pronës']),
              paymentTax1: getVal(['Payment Tax 1']),
              createdAt: serverTimestamp(),
              createdBy: user.uid
            });
          }

          if (validClients.length === 0) {
            alert('No valid clients found in the CSV. Please ensure you have at least "SUBJEKTI" and "Owner Name" columns.');
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          // Firestore batch limit is 500 operations. We'll chunk the data into batches of 450.
          const chunkSize = 450;
          for (let i = 0; i < validClients.length; i += chunkSize) {
            const chunk = validClients.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            
            for (const clientData of chunk) {
              const newClientRef = doc(collection(db, 'clients'));
              batch.set(newClientRef, clientData);
            }
            
            await batch.commit();
          }

          alert(`Successfully imported ${validClients.length} clients.`);
        } catch (error) {
          console.error("Error importing clients:", error);
          alert("There was an error importing the clients. Check console for details.");
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        alert("Error parsing CSV file.");
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const filteredClients = clients.filter(client => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      client.businessName?.toLowerCase().includes(query) ||
      client.businessNipt?.toLowerCase().includes(query) ||
      client.ownerName?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query)
    );
    
    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => client.tags?.includes(tag));
    
    return matchesSearch && matchesTags;
  });

  const handleExportCSV = () => {
    if (filteredClients.length === 0) {
      alert("No clients to export.");
      return;
    }

    const dataToExport = filteredClients.map(client => ({
      'SUBJEKTI': client.businessName || '',
      'NIPTI': client.businessNipt || '',
      'Owner Name': client.ownerName || '',
      'Email': client.email || '',
      'Email Password': client.emailPassword || '',
      'Password': client.password || '',
      'Phone': client.phone || '',
      'e-Albania Personal': client.eAlbaniaPersonal || '',
      'e-Albania Personal Password': client.eAlbaniaPersonalPassword || '',
      'e-Albania Business': client.eAlbaniaBusiness || '',
      'e-Albania Business Password': client.eAlbaniaBusinessPassword || '',
      'Status': client.status || 'active',
      'Tags': client.tags?.join(', ') || '',
      'Property Status': client.propertyStatus || '',
      'Payment Tax 1': client.paymentTax1 || '',
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `clients_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <div className="flex flex-col sm:flex-row items-center w-full sm:w-auto gap-4">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            />
          </div>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImportCSV}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className={`w-full sm:w-auto px-4 py-2 rounded-xl font-medium transition-colors flex items-center justify-center space-x-2 whitespace-nowrap ${
              isImporting 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Upload size={20} />
            <span>{isImporting ? 'Importing...' : 'Import CSV'}</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="w-full sm:w-auto px-4 py-2 rounded-xl font-medium transition-colors flex items-center justify-center space-x-2 whitespace-nowrap bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
          >
            <Download size={20} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={openAddModal}
            className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 whitespace-nowrap"
          >
            <Plus size={20} />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Tags Filter */}
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => {
              if (selectedTags.includes(tag)) {
                setSelectedTags(selectedTags.filter(t => t !== tag));
              } else {
                setSelectedTags([...selectedTags, tag]);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center ${
              selectedTags.includes(tag) 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Tag size={12} className="mr-1.5" />
            {tag}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <button
            onClick={() => setSelectedTags([])}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <th className="p-4 font-medium">SUBJEKTI</th>
              <th className="p-4 font-medium">NIPTI</th>
              <th className="p-4 font-medium">Owner Name</th>
              <th className="p-4 font-medium">Contact</th>
              <th className="p-4 font-medium">e-Albania Personal</th>
              <th className="p-4 font-medium">e-Albania Business</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="p-4 font-medium text-slate-900">
                  <div className="flex items-center">
                    <Building size={16} className="mr-2 text-indigo-500" />
                    {client.businessName}
                  </div>
                  {client.tags && client.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {client.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-4 text-slate-600 font-mono text-sm">{client.businessNipt || '-'}</td>
                <td className="p-4 text-slate-900">
                  <div className="flex items-center">
                    <UserIcon size={16} className="mr-2 text-slate-400" />
                    {client.ownerName}
                  </div>
                </td>
                <td className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-slate-600">
                      <Mail size={14} className="mr-2" /> {client.email}
                      {client.emailPassword && (
                        <span className="ml-2 flex items-center text-slate-500 font-mono">
                          <Key size={14} className="mr-1" /> {client.emailPassword}
                        </span>
                      )}
                    </div>
                    {client.phone && (
                      <div className="flex items-center text-sm text-slate-600">
                        <Phone size={14} className="mr-2" /> {client.phone}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-slate-600">
                      <UserIcon size={14} className="mr-2" /> {client.eAlbaniaPersonal || '-'}
                    </div>
                    {client.eAlbaniaPersonalPassword && (
                      <div className="flex items-center text-sm text-slate-500 font-mono">
                        <Key size={14} className="mr-2" /> {client.eAlbaniaPersonalPassword}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-slate-600">
                      <Briefcase size={14} className="mr-2" /> {client.eAlbaniaBusiness || '-'}
                    </div>
                    {client.eAlbaniaBusinessPassword && (
                      <div className="flex items-center text-sm text-slate-500 font-mono">
                        <Key size={14} className="mr-2" /> {client.eAlbaniaBusinessPassword}
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    client.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex justify-end space-x-1">
                    <button 
                      onClick={() => openEditModal(client, true)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={() => openEditModal(client, false)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Client"
                    >
                      <Edit size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">No clients found. Add one to get started.</td>
              </tr>
            ) : filteredClients.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500">No clients match your search.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-6xl w-full my-auto">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              {isReadOnly ? 'View Client Details' : editingClient ? 'Edit Client' : 'Add New Client'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SUBJEKTI *</label>
                  <input required disabled={isReadOnly} type="text" value={formData.businessName} onChange={e => setFormData({...formData, businessName: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIPTI</label>
                  <input disabled={isReadOnly} type="text" value={formData.businessNipt} onChange={e => setFormData({...formData, businessNipt: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name *</label>
                  <input required disabled={isReadOnly} type="text" value={formData.ownerName} onChange={e => setFormData({...formData, ownerName: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input disabled={isReadOnly} type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input disabled={isReadOnly} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Password</label>
                    <input disabled={isReadOnly} type="text" value={formData.emailPassword} onChange={e => setFormData({...formData, emailPassword: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono disabled:bg-slate-50 disabled:text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input disabled={isReadOnly} type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select disabled={isReadOnly} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Kategoritë / Filtrat</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {AVAILABLE_TAGS.map(tag => (
                    <label key={tag} className={`flex items-center space-x-2 text-sm text-slate-700 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                      <input 
                        type="checkbox" 
                        disabled={isReadOnly}
                        checked={formData.tags.includes(tag)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({...formData, tags: [...formData.tags, tag]});
                          } else {
                            setFormData({...formData, tags: formData.tags.filter(t => t !== tag)});
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Statusi i Pronës</h3>
                    <select 
                      disabled={isReadOnly}
                      value={formData.propertyStatus} 
                      onChange={e => setFormData({...formData, propertyStatus: e.target.value})} 
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value="">Zgjidh statusin...</option>
                      <option value="ME QERA">ME QERA</option>
                      <option value="Pronesi">Pronesi</option>
                      <option value="Transport">Transport</option>
                    </select>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Pagesa Tatimeve</h3>
                    <div className="relative group w-full">
                      <input 
                        type="text" 
                        disabled={isReadOnly}
                        placeholder="Payment Tax"
                        value={formData.paymentTax1} 
                        onChange={e => setFormData({...formData, paymentTax1: e.target.value})} 
                        className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" 
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(formData.paymentTax1 || '', 'pt-1')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedField === 'pt-1' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">e-Albania Credentials</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center"><UserIcon size={16} className="mr-2"/> Personal</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Username Personal</label>
                        <div className="relative">
                          <input type="text" disabled={isReadOnly} value={formData.eAlbaniaPersonal} onChange={e => setFormData({...formData, eAlbaniaPersonal: e.target.value})} className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-white/50 disabled:text-slate-500" />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(formData.eAlbaniaPersonal, 'eap')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedField === 'eap' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
                        <div className="relative">
                          <input type="text" disabled={isReadOnly} value={formData.eAlbaniaPersonalPassword} onChange={e => setFormData({...formData, eAlbaniaPersonalPassword: e.target.value})} className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono disabled:bg-white/50 disabled:text-slate-500" />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(formData.eAlbaniaPersonalPassword, 'eapp')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedField === 'eapp' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center"><Briefcase size={16} className="mr-2"/> Business</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Username Biznes</label>
                        <div className="relative">
                          <input type="text" disabled={isReadOnly} value={formData.eAlbaniaBusiness} onChange={e => setFormData({...formData, eAlbaniaBusiness: e.target.value})} className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-white/50 disabled:text-slate-500" />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(formData.eAlbaniaBusiness, 'eab')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedField === 'eab' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
                        <div className="relative">
                          <input type="text" disabled={isReadOnly} value={formData.eAlbaniaBusinessPassword} onChange={e => setFormData({...formData, eAlbaniaBusinessPassword: e.target.value})} className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono disabled:bg-white/50 disabled:text-slate-500" />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(formData.eAlbaniaBusinessPassword, 'eabp')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedField === 'eabp' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-100">
                {isReadOnly ? (
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">Close</button>
                ) : (
                  <>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                      {editingClient ? 'Update Client' : 'Save Client'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
