import {readFile,writeFile} from 'node:fs/promises';
const packages=[['three','LICENSE'],['polygon-clipping','LICENSE.md'],['robust-predicates','LICENSE'],['splaytree','Readme.md']];
let result='Rua Livre - Third-party notices\n\nMap data: © OpenStreetMap contributors, ODbL 1.0.\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\nRaw and derived map data and offline importer accompany the source distribution.\n\nOriginal application code\n\n'+await readFile('LICENSE','utf8');
for(const [name,file] of packages){const pkg=JSON.parse(await readFile(`node_modules/${name}/package.json`,'utf8'));let license=await readFile(`node_modules/${name}/${file}`,'utf8');if(name==='splaytree')license=license.slice(license.indexOf('## License')+'## License'.length).trim();result+=`\n\n${'='.repeat(65)}\n${name} ${pkg.version} (${pkg.license})\n${'='.repeat(65)}\n\n${license}\n`;}
await writeFile('THIRD-PARTY-NOTICES.txt',result);
