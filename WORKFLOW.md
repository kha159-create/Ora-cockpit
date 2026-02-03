# Ora-cockpit — طريقة العمل والرفع

## المسارات (لا نغيّرها ولا نربط مشاريع جديدة)

| الدور | محلي | جت هب |
|-------|------|--------|
| **مشروعنا (نشتغل عليه)** | `C:\Users\Orange1\Desktop\Ora-cockpit` | https://github.com/kha159-create/Ora-cockpit |
| **نأخذ منه التصاميم** | `C:\Users\Orange1\Desktop\cockpit` | — (مرجع فقط، لا ربط) |
| **المشروع الأصلي (البيانات)** | `C:\Users\Orange1\Desktop\orangettdata222` | https://github.com/ALAAWF2/orange-dashboard |

- **Ora-cockpit** = مشروعنا. كل التعديلات والرفع هنا.
- **cockpit** = مرجع التصميم فقط (Vite + React) — لا ربط Git، نستوحى منه الواجهة.
- **orangettdata222** = نسخة محلية من المشروع الأصلي (اختياري). **جميع أنواع البيانات** تأتي من الريبو الأصلي عبر الـ workflow كل 15 دقيقة.

---

## التقنية — Vite + React (مثل مرجع التصميم) ✓
- تطبيق الواجهة الرئيسي في **`spa/`**: Vite + React + TypeScript + Tailwind — **بدون صفحات HTML للتنقل**. نفس فكرة مرجع التصميم `cockpit`.
- **اختيار أي صفحة من القائمة (لوحة التحكم، التقارير، الموظفين، المعارض، المنتجات)** يبقى **داخل React** عبر React Router (HashRouter). لا يحوّل المتصفح إلى ملفات `.html`.
- نقطة الدخول للتطبيق: فتح **`spa/index.html`** (أو الصفحة المنشورة من الـ build) ثم التنقل عبر الروابط الداخلية — كلها مكونات React.
- ملفات `.html` في جذر المشروع (مثل reports.html، login.html) للتوافق أو الوصول المباشر فقط؛ التصميم المرجعي مطبّق في الـ SPA.
- **البيانات**: كلها من الريبو الأصلي ALAAWF2/orange-dashboard (تحديث تلقائي كل 15 دقيقة)، لا نعتمد على بيانات محلية.
- البناء: `npm run build` من مجلد `spa/` ينتج `spa/dist/`؛ workflow النشر يرفع `spa/dist` إلى gh-pages.

---

## الإعداد (تم ✓)
- **origin** = الـ fork عندك: https://github.com/kha159-create/Ora-cockpit
- **upstream** = المشروع الأصلي: https://github.com/ALAAWF2/orange-dashboard
- **الفرع الوحيد الذي نعمل عليه:** **main**. التحديث التلقائي من الريبو الأصلي (كل 15 دقيقة) والرفع اليدوي كلاهما يروحون لنفس البرانش **main** على kha159-create/Ora-cockpit.

### نشر التحديثات من الريبو الأصلي على الموقع
- الـ workflow "Sync Data From Upstream Every 15 Min" يسحب ملفات JSON من ALAAWF2/orange-dashboard ويُدخلها كوميت على فرع **main** ثم يرفع (`git push origin main`).
- عند أي push لـ **main** يغيّر ملفات تحت `spa/**` (بما فيها `spa/public/*.json`)، الـ workflow "Deploy SPA (gh-pages)" يشتغل تلقائياً: يبني الـ SPA ويُنشر الناتج على فرع **gh-pages**. لذلك تحديثات البيانات من الريبو الأصلي تنشر على موقعنا بشكل صحيح وعلى البرانش الصحيح (main للكود والبيانات، gh-pages لمخرجات الموقع).

### إعداد GitHub Pages (مهم لظهور الموقع)
- الموقع يُخدم من **فرع gh-pages** (وليس من main) لأن الـ SPA يُبنى ويُنشر هناك تلقائياً عند كل push لـ `spa/` على main.
- في الريبو: **Settings → Pages → Build and deployment → Source:** اختر **Deploy from a branch** ثم:
  - **Branch:** اختر **gh-pages** (وليس main).
  - **Folder:** / (root).
  - احفظ. بعد دقائق الموقع https://kha159-create.github.io/Ora-cockpit/ يعمل ويُظهر تطبيق React.
- إذا كانت الصفحة مضبوطة على **main** و **/ (root)** فستظهر 404 لأن في جذر main لا يوجد `index.html` (الـ SPA موجود داخل `spa/` ويُنشر إلى gh-pages).

---

## ترتيب العمل الصحيح: سحب ثم رفع

**قبل أي رفع:** اسحب آخر التحديثات من الريبو (إما من origin أو من upstream)، ثم ارفع تعديلاتك. هكذا لا تضيع كوميتات ولا تسبب تعارضات.

### 1) سحب التحديثات أولاً (من الـ fork أو من الأصلي)

من الـ fork (إذا كان غيرك رفع أو الـ Actions رفعت بيانات):
```powershell
cd $env:USERPROFILE\Desktop\Ora-cockpit
git fetch origin
git pull origin main
```

أو من المشروع الأصلي (إذا حاب تزامن مع orange-dashboard):
```powershell
cd $env:USERPROFILE\Desktop\Ora-cockpit
git fetch upstream
git merge upstream/main
# إذا في تعارضات: حلها ثم git add . && git commit
git push origin main
```

### 2) تعديل الملفات
عدّل في المشروع كما تريد.

### 3) حفظ ورفع التعديلات
```powershell
cd $env:USERPROFILE\Desktop\Ora-cockpit
git add .
git status
git commit -m "وصف التعديلات"
git pull origin main   # سحب أي تحديث حصل أثناء شغلك (اختياري لكن موصى به)
git push origin main
```

**الخلاصة:** سحب → تعديل → commit → (سحب مرة ثانية إذا طال الوقت) → رفع. بهذا الترتيب تضمن أن الريبو محدث ولا تضيع تغييرات.

### التحقق قبل الرفع (اختياري)
- من مجلد المشروع: `cd spa && npm run build` — التأكد أن البناء ينتج `spa/dist/` بدون أخطاء.
- التنقل داخل التطبيق يبقى في React (لوحة التحكم، التقارير، الموظفين، المعارض، المنتجات) دون تحويل إلى صفحات `.html`.

---

## إرسال تعديلات للمشروع الأصلي (Pull Request)
- افتح: https://github.com/kha159-create/Ora-cockpit
- **Contribute** → **Open pull request** تجاه **ALAAWF2/orange-dashboard**
- أو: **Pull requests** → **New pull request** (base: ALAAWF2/orange-dashboard)

---

## ⚠️ مهم — لا تضيع تعديلاتك
- **لا تضغط "Discard X commits" على GitHub** — يمسح كوميتاتك من الـ fork.
- السحب يكون من جهازك: `git fetch` + `git merge` (أو `git pull`) ثم `git push`. لا ترسل شيء للمشروع الأصلي إلا عبر Pull Request.
- سكربت `sync_fork.bat`: يسحب من upstream ويُدخل التحديثات محلياً (إذا شغّلته أنت). **البيانات** تُحدَّث على GitHub عبر workflow كل 15 دقيقة من الأصلي.

---
المجلد الجاهز للتعديل: `C:\Users\Orange1\Desktop\Ora-cockpit`
