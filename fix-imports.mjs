import fs from 'fs/promises';
import path from 'path';

async function fixImports() {
    const cmdsDir = './src/commands/music';
    const files = await fs.readdir(cmdsDir);

    for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const p = path.join(cmdsDir, file);
        let content = await fs.readFile(p, 'utf-8');

        // Fix the imports that point to ./something.js but should point to ../../lib/music/something.js
        // (because all utils and queueManager were moved to lib/music)
        content = content.replace(/from\s+['"]\.\/([^'"]+)['"]/g, (match, moduleName) => {
             // commands/music shouldn't have any local dependencies besides maybe each other? No, they don't depend on each other.
             // they all depend on lib/music
             return `from "../../lib/music/${moduleName}"`;
        });

        // Fix botRegistry import
        content = content.replace(/from\s+['"]\.\.\/botRegistry\.js['"]/g, 'from "../../lib/music/botRegistry.js"');

        await fs.writeFile(p, content);
        console.log(`Fixed imports in ${file}`);
    }
}

async function createBotRegistryStub() {
    const stubPath = './src/lib/music/botRegistry.ts';
    const stubContent = `// @ts-nocheck
export function findBotInVoiceChannel() { return null; }
export function findIdleBot() { return null; }
export function getOccupiedChannel() { return null; }
export function getClientQueueInChannel() { return null; }
export function getSiblings() { return []; }
`;
    await fs.writeFile(stubPath, stubContent);
    console.log('Created botRegistry stub.');
}

async function run() {
    await fixImports();
    await createBotRegistryStub();
}

run();
