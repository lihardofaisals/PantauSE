import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const geoJsonPath = path.join(__dirname, '../public/data/kab_asahan.geojson');
const data = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));

let totalTarget = 0;
data.features.forEach(f => {
    totalTarget += f.properties.Target_Usaha || 0;
});

console.log("Total Target Usaha in Asahan:", totalTarget);
