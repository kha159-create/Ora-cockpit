/** Store metadata */
export interface StoreMeta {
  manager?: string;
  city?: string;
  type?: string;
  region?: string;
}

/** Raw management data from upstream */
export interface ManagementData {
  stores: Record<string, string>;
  store_meta: Record<string, StoreMeta>;
  sales: [string, string, number][];
  transactions: [string, string, number][];
  visitors: [string, string, number][];
  targets: [string, string, number][];
  metadata?: { generated_at?: string };
}

/** Raw employees data from upstream */
export interface EmployeesData {
  history: Record<string, any[]>;
  employee_names: Record<string, string>;
  targets: Record<string, number>;
}

/** Period filter type */
export type PeriodFilter = 'today' | 'yesterday' | 'mtd' | 'month' | 'custom';

/** Sort direction */
export type SortDir = 'asc' | 'desc';
