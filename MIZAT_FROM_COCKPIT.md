# ميزات نأخذها من cockpit (React) ونطبّقها في Ora-cockpit

**المصدر:** cockpit — تطبيق React (k.a-cockpit)  
**الهدف:** هذا الريبو [Ora-cockpit](https://github.com/kha159-create/Ora-cockpit) — لوحة HTML

---

## ما نأخذه من cockpit ونضيفه هنا

| الميزة في cockpit | كيف نطبّقها في Ora-cockpit |
|-------------------|---------------------------|
| **Live Sales (مبيعات مباشرة)** | ربط widget.html أو صفحة مخصصة بـ API المبيعات المباشرة إن وُجدت (من cockpit/orangedata) |
| **فلاتر مدير المنطقة + فرع** | موجود في widget/employees — توحيد نفس المنطق في كل الصفحات |
| **عمولات (Commissions)** | إضافة صفحة عمولات أو قسم يعتمد منطق cockpit إن وُجدت بيانات |
| **تصدير Excel/PDF** | تحسين excel_export.js و pdf_export.js بناءً على ما في cockpit إن كان أفضل |
| **تصميم موحّد (page-header, page-filters, page-section)** | ✅ مطبّق بالفعل في هذا الريبو (انظر LAYOUT.md) |

---

## الريبو الخاص بنا

- **GitHub:** https://github.com/kha159-create/Ora-cockpit  
- **محلي (للشغل):** `C:\Users\Orange1\Desktop\Ora-cockpit`  
- **سحب تحديثات من الريبو الأصلي:** استخدم `sync_fork.bat` أو الملف في orangedata: `sync_ora_cockpit_fork.bat`

---

*آخر تحديث: بناءً على طلب توحيد الشغل على ريبو Ora-cockpit وأخذ الميزات من cockpit.*
