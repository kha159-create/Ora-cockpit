import * as XLSX from 'xlsx';
import { resolve } from 'path';

const filePath = 'C:/Users/Orange1/Downloads/mapping.xlsx';
try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Headers:', data[0]);
    console.log('First Row:', data[1]);
} catch (e) {
    console.error('Error reading file:', e);
}
