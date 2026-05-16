/**
 * Lexis AI Provider
 * Zprostředkovává komunikaci s AI modely (Ollama, OpenAI, atd.)
 */
const LexisAIProvider = async (prompt, systemPrompt) => {
    try {
        // Zde využíváme existující window.electronAPI.callOllama
        if (window.electronAPI && window.electronAPI.callOllama) {
            return await window.electronAPI.callOllama(prompt, systemPrompt);
        }
        return "AI API nedostupné (spuštěno mimo Electron?).";
    } catch (error) {
        console.error("AI Provider Error:", error);
        return "Chyba při komunikaci s AI.";
    }
};

window.LexisAIProvider = LexisAIProvider;
