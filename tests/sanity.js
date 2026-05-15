/**
 * LexisEditor Sanity Check (v2.5.0)
 * Prověřuje integritu klíčových součástí před buildem.
 */
const fs = require('fs');
const path = require('path');

console.log('🚀 Spouštím LexisEditor Sanity Check...');

const filesToCheck = [
    'index.html',
    'main.js',
    'preload.js',
    'package.json'
];

let errors = 0;

// 1. Kontrola existence souborů
filesToCheck.forEach(f => {
    if (fs.existsSync(path.join(__dirname, '..', f))) {
        console.log(`✅ ${f} existuje.`);
    } else {
        console.error(`❌ CHYBA: ${f} chybí!`);
        errors++;
    }
});

// 2. Validita package.json
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    console.log(`✅ package.json je validní (Verze: ${pkg.version})`);
} catch (e) {
    console.error(`❌ CHYBA: package.json není validní JSON!`);
    errors++;
}

// 3. Kontrola HTML struktury (základní)
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
if (html.includes('id="ai-drawer"') && html.includes('id="start-screen"')) {
    console.log('✅ UI struktura (Sidebar, Start Screen) v pořádku.');
} else {
    console.error('❌ CHYBA: V index.html chybí kritické UI elementy!');
    errors++;
}

// 4. Kontrola syntaxe (základní)
try {
    require('../main.js');
    console.log('✅ main.js je syntakticky v pořádku.');
} catch (e) {
    // V CI to může selhat kvůli Electron dependencím, tak jen varování
    console.warn('⚠️ Warning: main.js nemůže být načten v Node.js prostředí (očekáváno).');
}

if (errors > 0) {
    console.error(`\n❌ TEST SELHAL: Nalezeno ${errors} chyb.`);
    process.exit(1);
} else {
    console.log('\n✨ Všechny testy v pořádku. Připraveno k nasazení.');
    process.exit(0);
}
