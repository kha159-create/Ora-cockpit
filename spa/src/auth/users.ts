export type UserRole = 'Admin' | 'Manager' | 'Auditor' | 'BranchManager';

export type LocalUser = {
  name: string;
  role: UserRole;
  storeId?: string;
};

// Copied from repo root users.js (keep in sync)
export const USERS: Record<string, { pin: string; role: UserRole; storeId?: string }> = {
  "Sales Manager": { pin: "6587", role: "Admin" },
  "المنطقة الغربية": { pin: "1478", role: "Manager" },
  "اماني عسيري": { pin: "3698", role: "Manager" },
  "جهاد ايوبي": { pin: "2587", role: "Manager" },
  "خليل الصانع": { pin: "2131", role: "Manager" },
  "رضوان عطيوي": { pin: "7643", role: "Manager" },
  "شريفة العمري": { pin: "8491", role: "Manager" },
  "عبد الجليل الحبال": { pin: "1637", role: "Manager" },
  "عبدالله السرداح": { pin: "4618", role: "Manager" },
  "عبيدة السباعي": { pin: "1647", role: "Manager" },
  "محمدكلو": { pin: "4891", role: "Manager" },
  "منطقة الطائف": { pin: "6342", role: "Manager" },
  "علاء": { pin: "0000", role: "Auditor" },

  // Branch Managers (New)
  "عالية مول": { pin: "2391", role: "BranchManager", storeId: "23" },
  "نور مول": { pin: "2648", role: "BranchManager", storeId: "26" },
  "تبوك بارك": { pin: "2287", role: "BranchManager", storeId: "22" },
  "ينبع الدانة": { pin: "2415", role: "BranchManager", storeId: "24" },
  "عرعر": { pin: "1736", role: "BranchManager", storeId: "17" },
  "الجوف": { pin: "4492", role: "BranchManager", storeId: "44" }
};

