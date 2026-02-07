export interface Store {
    id: string;
    name: string;
    areaManager?: string;
    targets?: { [year: string]: { [month: string]: number } };
}

export interface Employee {
    id: string;
    name: string;
    store: string;
    role?: string;
    targets?: { [year: string]: { [month: string]: number } };
}

export interface DailyMetric {
    date: string; // YYYY-MM-DD
    storeId: string;
    employeeId?: string;
    sales: number;
    transactions: number;
    visitors: number;
}

export interface CommissionData {
    storeName: string;
    achievement: number; // percentage (0-100+)
    commissionRate: number; // percentage (0.5, 1, 2)
    employees: EmployeeCommission[];
}

export interface EmployeeCommission {
    id: string;
    name: string;
    totalSales: number;
    target: number;
    achievement: number; // percentage
    commissionRate: number; // percentage
    commissionAmount: number;
}
