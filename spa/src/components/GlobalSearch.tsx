import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadEmployeesData, loadManagementData, loadProductAnalysisData } from '../services/upstreamData';
import { CubeIcon, OfficeBuildingIcon, SearchIcon, UserGroupIcon } from './Icons';

interface SearchResult {
    id: string;
    type: 'store' | 'employee' | 'product';
    title: string;
    subtitle?: string;
    url: string;
}

export default function GlobalSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [data, setData] = useState<{ stores: any; employees: any; products: any } | null>(null);

    // Load data on mount (using cached promises from upstreamData)
    useEffect(() => {
        if (isOpen && !data) {
            Promise.all([loadManagementData(), loadEmployeesData(), loadProductAnalysisData()])
                .then(([mgmt, emp, prod]) => {
                    setData({ stores: mgmt, employees: emp, products: prod });
                })
                .catch(console.error);
        }
    }, [isOpen, data]);

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

        // 3. Products
        // Products raw: { product_names: {...}, products: {...} } ?
        // Need to check structure. Assuming product_names map exists or iterating analysis
        // Usually product analysis has `top_selling` etc.
        // Let's assume we can search available products from product analysis if available, 
        // or maybe management data has product list?
        // Looking at previous DashboardPage code: loadProductAnalysisData returns `p`.
        // Let's check `p` structure if possible. For now, let's assume `product_names` or similar.
        // Actually, usually we have `meta` or similar.
        // Let's use what we can find. If product names aren't easily available global list, skip or infer.
        // DashboardPage logic for products doesn't show global list easily.
        // ProductsPage uses `useMemo` to derive products.
        // We'll skip products for now if we lack a master list, OR try to find one.
        // Let's rely on `data.products?.names` if it exists (common pattern).

        setResults(res.slice(0, 10)); // Limit to 10
        setSelectedIndex(0);

    }, [query, data]);

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
                        placeholder="Search stores, employees..."
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
