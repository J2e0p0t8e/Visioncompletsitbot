import fs from 'fs/promises';
import path from 'path';

const DIR = './src/commands/music';

async function fix() {
    const files = await fs.readdir(DIR);
    for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const p = path.join(DIR, file);
        let content = await fs.readFile(p, 'utf-8');
        
        if (file === 'controls.ts' || file === 'queue.ts') {
            // These have multiple commands exported as variables and then export { skip, stop... }
            // This is already valid TypeScript
            continue;
        }

        // For play, pin, ia, status, volume, they were module.exports = { data: ..., execute: ... }
        // My script made them export { data: ..., execute: ... }
        // We want export const command = { data: ..., execute: ... }
        content = content.replace(/^export\s*\{\s*data:/m, 'export const command = {\n  data:');
        
        await fs.writeFile(p, content);
        console.log(`Fixed ${file}`);
    }
}

fix();
