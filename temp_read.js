const fs = require('fs');
try {
    const stats = fs.statSync('/Users/zdenekdias/Downloads/LexisLocal_Sitova_Politika.docx');
    console.log("SUCCESS! File size:", stats.size);
} catch (e) {
    console.error("ERROR reading file:", e.message);
}
