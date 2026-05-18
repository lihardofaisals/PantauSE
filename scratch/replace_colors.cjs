const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/SpatialDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace indigo with orange and amber
content = content.replace(/indigo/g, 'orange');

fs.writeFileSync(filePath, content);
console.log('Done replacing colors in SpatialDashboard');
