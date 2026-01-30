# Ora-cockpit — طريقة العمل والرفع

## الإعداد (تم ✓)
- **origin** = الـ fork عندك: https://github.com/kha159-create/Ora-cockpit
- **upstream** = المشروع الأصلي: https://github.com/ALAAWF2/orange-dashboard
- **تصميم القائمة الجانبية** مطبّق على كل الصفحات (الرئيسية، الموظفين، تحليل المنتجات، تفاصيل الفروع، الأهداف، الشات بوت، المنتجات الراكدة، تحليل العروض، تدقيق البيانات، إعدادات الأهداف، متابعة مبيعات اليوم). صفحة تسجيل الدخول بدون قائمة جانبية.

## التعديل والرفع

1. **عدّل الملفات** في هذا المجلد (Ora-cockpit) كما تريد.

2. **احفظ التغييرات في Git وارفعها على الـ fork:**
   ```powershell
   cd $env:USERPROFILE\Desktop\Ora-cockpit
   git add .
   git status
   git commit -m "وصف التعديلات"
   git push origin main
   ```

3. **إرسال التعديلات للمشروع الأصلي (Pull Request):**
   - افتح: https://github.com/kha159-create/Ora-cockpit
   - اضغط **Contribute** ثم **Open pull request** تجاه **ALAAWF2/orange-dashboard**
   - أو: **Pull requests** → **New pull request** واختر base: ALAAWF2/orange-dashboard

## جلب تحديثات من المشروع الأصلي (اختياري)
إذا حاب تزامن الـ fork مع آخر تحديثات orange-dashboard:
```powershell
cd $env:USERPROFILE\Desktop\Ora-cockpit
git fetch upstream
git merge upstream/main
git push origin main
```

---
المجلد الجاهز للتعديل: `C:\Users\Orange1\Desktop\Ora-cockpit`
