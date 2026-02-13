const fs = require('fs');
const path = require('path');

// Load Data
const mgmtPath = path.join(__dirname, 'spa', 'public', 'management_data.json');
const stockPath = path.join(__dirname, 'spa', 'public', 'products_stock.json');

const mgmtRaw = JSON.parse(fs.readFileSync(mgmtPath, 'utf8'));
const stockRaw = JSON.parse(fs.readFileSync(stockPath, 'utf8'));

// Build Store Map (Name -> ID)
const storesMap = mgmtRaw.stores || {};
const storeNameTokId = {};
Object.entries(storesMap).forEach(([id, name]) => {
    if (name) storeNameTokId[name.trim()] = id;
});

console.log("Store Mapping (Name -> ID) Sample:");
console.log(Object.entries(storeNameTokId).slice(0, 5));

// Simulate Stock Processing
let matchCount = 0;
let failCount = 0;
let branchKeysFound = new Set();

stockRaw.forEach(item => {
    if (item.branches && typeof item.branches === 'object') {
        Object.entries(item.branches).forEach(([brName, brQty]) => {
            const cleanName = brName.trim();
            branchKeysFound.add(cleanName);
            if (storeNameTokId[cleanName]) {
                matchCount++;
            } else {
                failCount++;
                if (failCount < 5) console.log(`Failed to match branch: "${cleanName}"`);
            }
        });
    }
});

console.log(`\nResults:`);
console.log(`Total Matches: ${matchCount}`);
console.log(`Total Failures: ${failCount}`);
console.log(`Unique Branch Names Found: ${branchKeysFound.size}`);
console.log(`Branch Names (First 10):`, Array.from(branchKeysFound).slice(0, 10));
