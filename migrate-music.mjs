import fs from 'fs/promises';
import path from 'path';

const SRC_DIR = '../../music-bot/src';
const DEST_LIB_DIR = './src/lib/music';
const DEST_CMD_DIR = './src/commands/music';

async function migrateFile(srcPath, destPath) {
    try {
        let content = await fs.readFile(srcPath, 'utf-8');

        // Convert require() to import
        content = content.replace(/const\s+\{\s*([^}]+)\s*\}\s*=\s*require\((['"])([^'"]+)\2\);/g, (match, imports, quote, modulePath) => {
            if (modulePath.startsWith('.')) {
                // Remove /utils/ from internal relative paths if they are moved together
                // since they are all going into src/lib/music/
                modulePath = modulePath.replace('../utils/', './').replace('./utils/', './').replace('../queueManager', './queueManager');
                if (!modulePath.endsWith('.js')) {
                     modulePath += '.js';
                }
            }
            return `import { ${imports} } from "${modulePath}";`;
        });

        content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\((['"])([^'"]+)\2\);/g, (match, importName, quote, modulePath) => {
             if (modulePath.startsWith('.')) {
                modulePath = modulePath.replace('../utils/', './').replace('./utils/', './').replace('../queueManager', './queueManager');
                if (!modulePath.endsWith('.js')) {
                     modulePath += '.js';
                }
            }
            return `import ${importName} from "${modulePath}";`;
        });

        // Convert module.exports = { ... } to export { ... }
        content = content.replace(/module\.exports\s*=\s*\{([\s\S]*?)\};/g, 'export {$1};');
        
        // Convert module.exports = ... to export default ...
        content = content.replace(/module\.exports\s*=\s*(.*?);/g, 'export default $1;');

        // For commands, we need a specific export format for vision-bot
        if (destPath.includes('/commands/')) {
            // we have export default { data: ..., execute: ... }
            // replace with export const command = { data: ..., execute: ... }
            content = content.replace(/export default\s+\{/g, 'export const command = {');
        }

        // Add @ts-nocheck to bypass type errors initially
        content = `// @ts-nocheck\n` + content;

        await fs.mkdir(path.dirname(destPath), { recursive: true });
        // Save as .ts
        const finalDest = destPath.replace('.js', '.ts');
        await fs.writeFile(finalDest, content);
        console.log(`Migrated ${srcPath} -> ${finalDest}`);
    } catch (e) {
        console.error(`Error migrating ${srcPath}:`, e);
    }
}

async function run() {
    await fs.mkdir(DEST_LIB_DIR, { recursive: true });
    await fs.mkdir(DEST_CMD_DIR, { recursive: true });

    // Utils
    const utils = await fs.readdir(path.join(SRC_DIR, 'utils'));
    for (const file of utils) {
        if (file.endsWith('.js')) {
            await migrateFile(path.join(SRC_DIR, 'utils', file), path.join(DEST_LIB_DIR, file));
        }
    }

    // Queue Manager
    await migrateFile(path.join(SRC_DIR, 'queueManager.js'), path.join(DEST_LIB_DIR, 'queueManager.js'));

    // Commands
    const cmds = await fs.readdir(path.join(SRC_DIR, 'commands'));
    for (const file of cmds) {
        if (file.endsWith('.js')) {
            await migrateFile(path.join(SRC_DIR, 'commands', file), path.join(DEST_CMD_DIR, file));
        }
    }
}

run();
