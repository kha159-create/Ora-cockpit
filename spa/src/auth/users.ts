export type UserRole = 'Admin' | 'Manager' | 'Auditor';

export type LocalUser = {
  name: string;
  role: UserRole;
};

// Copied from repo root users.js (keep in sync)
export const USERS: Record<string, { pin: string; role: UserRole }> = {
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
  "علاء": { pin: "0000", role: "Auditor" }
};

