// Read-only integrity and date-coverage audit of this repository's archived datasets.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('public');
const required = [
  'management_data.json',
  'employees_data.json',
  'product_analysis_data.json',
  'offers_data.json',
  'stagnant_data.json',
  'products_stock.json',
  'product_mapping.json',
];

for (const file of required) {
  const path = resolve(dir, file);
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error('Required archived data missing or empty: ' + file);
  }
  console.log('ARCHIVE_FILE', file, statSync(path).size);
}

const iso = (value) => {
  const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
};
const describe = (dates, count, label, metadata) => {
  console.log('ARCHIVE_COVERAGE', JSON.stringify({ dataset:label, records:count,
    first: dates.min, last:dates.max,
    generatedAt:metadata?.generated_at ?? metadata?.generatedAt ?? null }));
};
const stats = () => ({ min:null, max:null });
function visit(s, date) {
  const d = iso(date);
  if (!d) return;
  if (s.min===null || d < s.min) s.min=d;
  if (s.max===null || d > s.max) s.max=d;
}
{
  const j = JSON.parse(readFileSync(resolve(dir,'management_data.json'),'utf8'));
  const d = stats();
  for (const row of j.sales || []) visit(d, row?.[0]);
  describe(d,(j.sales||[]).length,'management.sales',j.metadata);
}
{
  const j = JSON.parse(readFileSync(resolve(dir,'employees_data.json'),'utf8'));
  const d = stats(); let count=0;
  for (const rows of Object.values(j.history||{})) if (Array.isArray(rows)) {
    count += rows.length;
    for (const row of rows) visit(d,row?.[0]);
  }
  describe(d,count,'employees.history',j.metadata);
}
{
  const j = JSON.parse(readFileSync(resolve(dir,'product_analysis_data.json'),'utf8'));
  const d = stats(); let count=0;
  for (const rows of Object.values(j.product_daily_history||{})) if (Array.isArray(rows)) {
    count += rows.length;
    for (const row of rows) visit(d,row?.date);
  }
  describe(d,count,'product_daily_history',j.metadata);
}
// Employee product-by-employee details are not part of the frozen archive.
// Core historical sales must never be fabricated from a missing detail dataset.
console.log('ARCHIVE_AUDIT_COMPLETE');
