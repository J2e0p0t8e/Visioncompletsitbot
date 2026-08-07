import fs from 'fs/promises';

async function fixInlineImports(file) {
    let content = await fs.readFile(file, 'utf-8');
    const importsToMove = [];
    
    // Find all inline imports
    content = content.replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm, (match, names, path) => {
        importsToMove.push(`import { ${names.trim()} } from "${path}";`);
        return ''; // Remove the inline import
    });

    if (importsToMove.length > 0) {
        // Find the last import at the top of the file
        const lines = content.split('\n');
        let lastImportIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                lastImportIndex = i;
            }
        }
        
        // Remove duplicates and insert
        const uniqueImports = [...new Set(importsToMove)];
        lines.splice(lastImportIndex + 1, 0, ...uniqueImports);
        
        await fs.writeFile(file, lines.join('\n'));
        console.log(`Fixed inline imports in ${file}`);
    }
}

async function run() {
    await fixInlineImports('./src/lib/music/playerPanel.ts');
    await fixInlineImports('./src/lib/music/voiceManager.ts');
}

run();
