const fs = require('fs');
const { execSync } = require('child_process');

function extractTextFromDocx(filePath) {
    try {
        const documentXml = execSync(`unzip -p "${filePath}" word/document.xml`, { 
            encoding: 'utf-8', 
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const paragraphMatches = documentXml.match(/<w:p[^>]*>([\s\S]*?)<\/w:p>/g) || [];
        const paragraphs = paragraphMatches.map(p => {
            const textMatches = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
            return textMatches
                .map(m => m.replace(/<[^>]+>/g, ''))
                .join('')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
        });
        return paragraphs.join('\n\n').trim();
    } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : '';
        return `Chyba při parsování Word XML: ${err.message}\nStderr: ${stderr}`;
    }
}

const target = '/Users/zdenekdias/Projects/LexisLocal/LexisLocal_Sitova_Politika.docx';
if (fs.existsSync(target)) {
    console.log("--- START OF TEXT ---");
    console.log(extractTextFromDocx(target));
    console.log("--- END OF TEXT ---");
} else {
    console.log("WAITING_FOR_FILE");
}
