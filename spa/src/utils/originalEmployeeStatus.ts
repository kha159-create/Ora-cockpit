export type OriginalEmployeeStatus = 'active' | 'medium' | 'high';

export interface OriginalEmployeeStatusInfo {
  id: string;
  sales: number;
  trans: number;
  status: OriginalEmployeeStatus;
  reasons: string[];
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function buildOriginalEmployeeStatusMap(
  rawEmp: any,
  passFilter: (storeId: string) => boolean,
  rangeStart: string,
  rangeEnd: string,
  referenceDate: Date = new Date()
): Record<string, OriginalEmployeeStatusInfo> {
  const history = rawEmp?.history || {};
  const employees: Record<string, { id: string; sales: number; trans: number; dailySales: Record<string, number> }> = {};

  Object.entries(history).forEach(([storeId, records]: [string, any]) => {
    if (!passFilter(storeId)) return;
    (records || []).forEach((rec: any[]) => {
      const date = String(rec?.[0] || '').substring(0, 10);
      if (date < rangeStart || date > rangeEnd) return;

      const id = String(rec?.[1] || '').split('-')[0].trim();
      if (!id || id === 'مرتجع') return;

      const sales = Number(rec?.[2]) || 0;
      const trans = Number(rec?.[3]) || 0;
      if (!employees[id]) employees[id] = { id, sales: 0, trans: 0, dailySales: {} };
      employees[id].sales += sales;
      employees[id].trans += trans;
      employees[id].dailySales[date] = (employees[id].dailySales[date] || 0) + sales;
    });
  });

  const list = Object.values(employees);
  const totalSales = list.reduce((sum, emp) => sum + emp.sales, 0);
  const avgActiveSales = list.length > 0 ? totalSales / list.length : 0;

  const last15DaysStart = new Date(referenceDate);
  last15DaysStart.setDate(referenceDate.getDate() - 15);
  const last15DaysStartStr = toYMD(last15DaysStart);

  return Object.fromEntries(list.map((emp) => {
    const reasons: string[] = [];
    const dailyRecords = Object.entries(emp.dailySales);
    const hasRecentSales = dailyRecords.some(([date, sales]) => date >= last15DaysStartStr && sales > 0);

    if (dailyRecords.length > 0 && !hasRecentSales) {
      reasons.push('لا مبيعات آخر 15 يوم');
    }
    if (avgActiveSales > 0 && emp.sales < avgActiveSales * 0.3) {
      reasons.push('متوسط مبيعات ضعيف');
    }

    const status: OriginalEmployeeStatus = reasons.length >= 2 ? 'high' : reasons.length === 1 ? 'medium' : 'active';
    return [emp.id, { id: emp.id, sales: emp.sales, trans: emp.trans, status, reasons }];
  }));
}

export function isOriginalActiveEmployee(statusMap: Record<string, OriginalEmployeeStatusInfo>, rawId: string) {
  const id = String(rawId || '').split('-')[0].trim();
  const id4 = id.padStart(4, '0');
  return (statusMap[id]?.status || statusMap[id4]?.status) === 'active';
}
