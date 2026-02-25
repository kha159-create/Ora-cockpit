import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadEmployeesData, loadManagementData, loadProductAnalysisData, loadProductMapping } from '../services/upstreamData';
import { CubeIcon, OfficeBuildingIcon, SearchIcon, UserGroupIcon } from './Icons';

interface SearchResult {
    id: string;
    type: 'store' | 'employee' | 'product';
    title: string;
    subtitle?: string;
    url: string;
}

export default function GlobalSearch({ isOpen, onClose, user, mgmtData }: { isOpen: boolean; onClose: () => void; user?: any; mgmtData?: any }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [data, setData] = useState<{ stores: any; employees: any; products: any; mapping: any[] } | null>(null);

    // Load data on mount (using cached promises from upstreamData)
    useEffect(() => {
        if (isOpen && !data) {
            Promise.all([loadManagementData(), loadEmployeesData(), loadProductAnalysisData(), loadProductMapping()])
                .then(([mgmt, emp, prod, map]) => {
                    setData({ stores: mgmt, employees: emp, products: prod, mapping: map || [] });
                })
                .catch(console.error);
        }
    }, [isOpen, data]);

    // Pre-process product names for faster lookup
    const productNames = useMemo(() => {
        if (!data?.products) return {};
        const names: Record<string, string> = {};
        // Try to source names from multiple places in analysis data
        const periods = ['mtd', 'yest', '30d'];
        periods.forEach(p => {
            const catalog = data.products.periods?.[p]?.catalog || {};
            Object.values(catalog).forEach((storeItems: any) => {
                if (Array.isArray(storeItems)) {
                    storeItems.forEach((item: any) => {
                        if (item.id && item.name) names[item.id] = item.name;
                    });
                }
            });
        });
        return names;
    }, [data?.products]);

    // Permissions: Allowed store IDs for the current user
    const allowedStoreIds = useMemo(() => {
        if (!mgmtData?.store_meta) return null;
        const meta: Record<string, any> = mgmtData.store_meta;
        const isManager = user?.role === 'Manager' || (user?.role !== 'Admin' && user?.role !== 'Auditor' && user?.name && user?.name !== 'Sales Manager');
        if (!isManager) return null; // Admin/Auditor can see everything

        const allowed = new Set<string>();
        Object.entries(meta).forEach(([sid, m]) => {
            if (m?.manager === user.name) allowed.add(sid);
        });
        return allowed;
    }, [mgmtData, user]);

    // Map: Employee ID -> Set of Store IDs they are linked to (from history)
    const empToStores = useMemo(() => {
        if (!data?.employees?.history) return {};
        const map: Record<string, Set<string>> = {};
        Object.entries(data.employees.history).forEach(([sid, entries]: [string, any]) => {
            if (!Array.isArray(entries)) return;
            entries.forEach((row: any[]) => {
                let eid = String(row[1] || '').split('-')[0].trim();
                if (!eid) return;
                if (!map[eid]) map[eid] = new Set();
                map[eid].add(sid);
            });
        });
        return map;
    }, [data?.employees?.history]);

    // Search Logic
    useEffect(() => {
        if (!query.trim() || !data) {
            setResults([]);
            return;
        }

        const q = query.toLowerCase();
        const res: SearchResult[] = [];

        // 1. Stores
        if (data.stores?.stores) {
            Object.entries(data.stores.stores).forEach(([id, name]: [string, any]) => {
                if (allowedStoreIds && !allowedStoreIds.has(id)) return; // Filter by permission

                const sName = String(name).toLowerCase();
                if (sName.includes(q) || id.includes(q)) {
                    res.push({
                        id,
                        type: 'store',
                        title: String(name),
                        subtitle: `Store ID: ${id}`,
                        url: `/stores?sid=${id}`,
                    });
                }
            });
        }

        // 2. Employees Array match
        if (data.employees?.employee_names) {
            Object.entries(data.employees.employee_names).forEach(([id, name]: [string, any]) => {
                // Permission Check: Does this employee belong to any of the manager's stores?
                if (allowedStoreIds) {
                    const linkedStores = empToStores[id];
                    let isAllowed = false;
                    if (linkedStores) {
                        for (const sid of Array.from(linkedStores)) {
                            if (allowedStoreIds.has(sid)) { isAllowed = true; break; }
                        }
                    }
                    if (!isAllowed) return;
                }

                const eName = String(name).toLowerCase();
                if (eName.includes(q) || id.includes(q)) {
                    res.push({
                        id,
                        type: 'employee',
                        title: String(name),
                        subtitle: `Employee ID: ${id}`,
                        url: `/employees?eid=${id}`,
                    });
                }
            });
        }

        // 3. Products (Alias/Dynamic Code/ID)
        if (data.mapping) {
            // Filter mapping
            const matches = data.mapping.filter(m =>
                (m.alias && String(m.alias).includes(q)) ||
                (m.dCode && String(m.dCode).includes(q)) ||
                (m.id && String(m.id).includes(q))
            ).slice(0, 10); // Limit matches source

            matches.forEach(m => {
                const name = productNames[m.id] || m.name || m.cat || 'Unknown Product';
                // Avoid duplicates if already added (unlikely with just mapping source)
                // But we might match same product via alias AND id
                if (!res.find(r => r.type === 'product' && r.id === m.id)) {
                    res.push({
                        id: m.id,
                        type: 'product',
                        title: name,
                        subtitle: `${m.cat ? m.cat + ' | ' : ''}ID: ${m.id} ${m.alias ? `| Alias: ${m.alias}` : ''} ${m.dCode ? `| DC: ${m.dCode}` : ''}`,
                        url: `/products?pid=${m.id}`,
                    });
                }
            });
        }

        setResults(res.slice(0, 20)); // Limit to 20 total
        setSelectedIndex(0);

    }, [query, data, productNames, allowedStoreIds, empToStores]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results[selectedIndex]) {
                    handleSelect(results[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, results, selectedIndex]);

    const handleSelect = (item: SearchResult) => {
        navigate(item.url);
        onClose();
        setQuery('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-neutral-200 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center p-4 border-b border-neutral-100 gap-3">
                    <SearchIcon className="w-6 h-6 text-neutral-400" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search stores, employees, products..."
                        className="flex-1 text-lg outline-none placeholder:text-neutral-400 text-neutral-900 bg-transparent"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors">
                        <div className="text-xs bg-neutral-200 px-2 py-1 rounded border border-neutral-300">ESC</div>
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {results.length === 0 ? (
                        <div className="p-8 text-center text-neutral-400">
                            {query ? 'No results found.' : 'Start typing to search...'}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {results.map((item, idx) => (
                                <button
                                    key={`${item.type}-${item.id}`}
                                    onClick={() => handleSelect(item)}
                                    className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left ${idx === selectedIndex ? 'bg-orange-50 text-orange-900 shadow-sm ring-1 ring-orange-200' : 'text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                >
                                    <div className={`p-2 rounded-lg ${item.type === 'store' ? 'bg-blue-100 text-blue-600' :
                                        item.type === 'employee' ? 'bg-green-100 text-green-600' :
                                            'bg-purple-100 text-purple-600'
                                        }`}>
                                        {item.type === 'store' && <OfficeBuildingIcon className="w-5 h-5" />}
                                        {item.type === 'employee' && <UserGroupIcon className="w-5 h-5" />}
                                        {item.type === 'product' && <CubeIcon className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold truncate">{item.title}</div>
                                        <div className="text-xs opacity-70 truncate">{item.subtitle}</div>
                                    </div>
                                    {idx === selectedIndex && (
                                        <div className="text-xs text-orange-600 font-bold px-2">Go</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-2 border-t border-neutral-100 bg-neutral-50 text-xs text-neutral-500 flex justify-between px-4">
                    <span>Use <strong>↑↓</strong> to navigate</span>
                    <span><strong>Enter</strong> to select</span>
                </div>
            </div>
        </div>
    );
}
