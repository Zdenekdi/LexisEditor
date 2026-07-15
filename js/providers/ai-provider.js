/* global Quill, DOMPurify, localStorage */
/**
 * Lexis AI Provider
 * Zprostředkovává komunikaci s lokálními i cloudovými AI modely.
 * Podporuje Apple Intelligence (apfel), Ollama, OpenAI, DeepSeek, Google Gemini a LM Studio.
 */
const LexisAIProvider = async (prompt, systemPrompt = "Jste špičkový český právní asistent.") => {
    // Deklarováno ve scope funkce (ne v try) — jinak by odkaz v catch bloku
    // (offline fallback) házel ReferenceError a fallback by se nikdy nespustil.
    let enableOfflineFallback = true;
    try {
        let provider = "ollama";
        let model = "llama3";
        let endpoint = "http://localhost:11434/api/generate";
        let apiKey = "";

        const provEl = document.getElementById('ai-provider');
        const modelEl = document.getElementById('ai-model');
        const endEl = document.getElementById('ai-endpoint');
        const keyEl = document.getElementById('ai-apikey');

        if (provEl) provider = provEl.value;
        if (modelEl) model = modelEl.value;
        if (endEl) endpoint = endEl.value;
        if (keyEl) apiKey = keyEl.value;

        const fallbackEl = document.getElementById('ai-offline-fallback');
        if (fallbackEl) enableOfflineFallback = fallbackEl.checked;

        const saved = localStorage.getItem('lexis_ai_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (!provEl && s.provider) provider = s.provider;
                if (!modelEl && s.model) model = s.model;
                if (!endEl && s.endpoint) endpoint = s.endpoint;
                if (!keyEl && s.apiKey) apiKey = s.apiKey;
                if (s.enableOfflineFallback !== undefined) {
                    if (!fallbackEl) enableOfflineFallback = s.enableOfflineFallback;
                }
            } catch (e) {
                console.error("Chyba při parsování localStorage AI nastavení:", e);
            }
        }

        console.log(`[LexisAIProvider] Volám model ${model} přes poskytovatele ${provider} na endpoint ${endpoint}...`);

        // Dynamicky nastavit System Prompt na základě zvoleného Agenta
        const agentSelect = document.getElementById('lexislocal-agent');
        const agentId = agentSelect ? agentSelect.value : 'resersnik';
        
        let systemPromptToUse = systemPrompt;
        if (agentId === 'resersnik') {
            systemPromptToUse = `Jsi špičkový český právní rešeršník (Lexis Research Agent). Tvým úkolem je poskytovat přesné, objektivní a strukturované analýzy českého právního řádu (zejména občanského zákoníku, obchodního zákoníku, trestního zákoníku a správního řádu) a judikatury (Nejvyšší soud, Nejvyšší správní soud, Ústavní soud ČR).
1. Vždy uváděj přesná zákonná ustanovení (paragrafy a čísla zákonů, např. zákon č. 89/2012 Sb., občanský zákoník).
2. Pokud odkazuješ na judikaturu, uváděj spisové značky (např. 26 Cdo 1230/2021) a popiš stručně právní větu.
3. Pokud si nejsi jistý, nikdy si právní předpisy ani judikáty nevymýšlej.`;
        } else if (agentId === 'stylista') {
            systemPromptToUse = `Jsi zkušený český advokát a mistr právní stylizace (Lexis Drafting Agent). Tvým úkolem je upravovat texty, navrhovat smluvní doložky a sepisovat právní podání.
1. Používej striktně přesnou českou právní terminologii (např. "vyloučení postoupení pohledávky", "smluvní pokuta", "jistota" namísto kauce, apod.).
2. Texty stylizuj tak, aby chránily zájmy klienta a byly jednoznačné.
3. Piš aktivním rodoslovem, pokud je to možné, a vyhýbej se zbytečně archaickým nebo nesrozumitelným souvětím.`;
        } else if (agentId === 'kontrolor') {
            systemPromptToUse = `Jsi neúprosný právní auditor a specialista na řízení rizik (Lexis Audit Agent). Tvým úkolem je analýza rizik ve smlouvách a právních dokumentech.
1. Hledej nevýhodná ujednání, skryté automatické prolongace a nejasné platební podmínky.
2. Upozorni na ustanovení, která by mohla být neplatná pro rozpor se zákonem nebo dobrými mravy.
3. Vytvoř seznam chybějících klíčových ustanovení.`;
        } else if (agentId === 'spisovatel') {
            systemPromptToUse = `Jsi špičkový český advokát a mistr legislativního a kontraktuálního draftování (Lexis Writing Agent). Tvým úkolem je na základě zadání sestavovat precizní, bezchybné a strukturované právní dokumenty (zejména smlouvy, dohody, podání k soudu, odvolání, žaloby) odpovídající standardům kvality a struktury profesionálních vzorů z portálu POHODA (portal.pohoda.cz) a aktuálnímu občanskému zákoníku (zákon č. 89/2012 Sb.). Každá generovaná smlouva musí být úplná a strukturovaná do přehledných článků označených římskými číslicemi (Článek I až Článek X, podle povahy): 1. SMLUVNÍ STRANY (název/jméno, sídlo/bydliště, IČO, DIČ, zapsaná v obchodním rejstříku, zastoupená, bankovní spojení a číslo účtu s prázdnými poli [Doplnit...]), 2. ČLÁNEK I. PŘEDMĚT SMLOUVY, 3. ČLÁNEK II. DOBA A MÍSTO PLNĚNÍ, 4. ČLÁNEK III. CENA A PLATEBNÍ PODMÍNKY (cena, DPH, splatnost 14 dnů), 5. ČLÁNEK IV. PRÁVA A POVINNOSTI STRAN, 6. ČLÁNEK V. PŘEDÁNÍ A PŘEVZETÍ, 7. ČLÁNEK VI. ODPOVĚDNOST ZA VADY A ZÁRUKA, 8. ČLÁNEK VII. SMLUVNÍ POKUTY A SANKCE, 9. ČLÁNEK VIII. ZÁVĚREČNÁ USTANOVENÍ, 10. PODPISOVÝ BLOK. Piš v českém jazyce, s vysokou právní přesností, bez jakýchkoliv neformálních komentářů či úvodních a závěrečných zdvořilostních frází. Výsledkem musí být přímo použitelný právní text.`;
        } else if (agentId === 'sekretarka') {
            systemPromptToUse = `Jsi vysoce organizovaná a profesionální advokátní sekretářka (Lexis Secretary Agent). Tvým úkolem je pomáhat advokátům strukturovat úkoly, shrnout termíny, upravovat tón e-mailové komunikace s klienty a organizovat spisové složky.`;
        }

        // --- PŘIDÁNO: Globální instrukce pro záhlaví a zápatí ---
        systemPromptToUse += `\n\nDŮLEŽITÉ: Při generování smluv a podání generuj VŽDY pouze tělo dokumentu. Záhlaví a zápatí dokumentu nech na pokoji. Pokud z kontextu znáš "číslo jednací" nebo "číslo spisu", přidej kamkoliv do své odpovědi speciální skrytý HTML tag: <meta data-spis="ZDE_TVOJE_HODNOTA" /> (např. <meta data-spis="123/2024" />). Zbytek generuj jako čisté HTML (nadpisy, odstavce, bold).`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 300s timeout for local/CPU LLM load

        try {
            // 0. LexisLocal Swarm Swarm Orchestrator
            if (provider === 'lexislocal') {
                const modelSelect = document.getElementById('lexislocal-model');
                const selectedModel = modelSelect ? modelSelect.value : 'llama3';

                let contextText = "";
                if (window.quill) {
                    const range = window.quill.getSelection();
                    if (range && range.length > 0) {
                        contextText = window.quill.getText(range.index, range.length);
                    }
                }

                // Heuristically adjust endpoint URL to LexisLocal server port (4000) if defaulted to Ollama (11434)
                let baseEndpoint = endpoint;
                if (baseEndpoint.includes("11434") || baseEndpoint.includes("/api/generate")) {
                    const isHttps = endpoint.startsWith("https:");
                    baseEndpoint = `${isHttps ? "https" : "http"}://localhost:4000`;
                }
                if (baseEndpoint.endsWith("/")) {
                    baseEndpoint = baseEndpoint.slice(0, -1);
                }

                const headers = { "Content-Type": "application/json" };
                if (apiKey) {
                    headers["X-API-Token"] = apiKey;
                }

                const response = await fetch(`${baseEndpoint}/api/agent/${agentId}`, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        prompt: prompt,
                        context: contextText,
                        model: selectedModel
                    }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    return data.response;
                }
                throw new Error(`LexisLocal Swarm vrátila status ${response.status}`);
            }

            // 1. Apple Intelligence (apfel) / OpenAI / DeepSeek / LM Studio / Anthropic
            if (provider === 'apfel' || provider === 'openai' || provider === 'deepseek' || provider === 'lmstudio' || provider === 'anthropic') {
                const headers = { "Content-Type": "application/json" };
                if (apiKey) {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: systemPromptToUse },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.3
                    }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        return data.choices[0].message.content;
                    }
                }
                throw new Error(`API vrátilo status ${response.status}`);
            }

            // 2. Nativní Ollama (/api/generate)
            if (provider === 'ollama') {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: model,
                        prompt: prompt,
                        system: systemPromptToUse,
                        stream: false,
                        options: {
                            temperature: 0.3
                        }
                    }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    return data.response;
                }
                throw new Error(`Ollama vrátila status ${response.status}`);
            }

            // 3. Google Gemini
            if (provider === 'google') {
                const url = `${endpoint}?key=${apiKey}`;
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    { text: `${systemPromptToUse}\n\nUživatel: ${prompt}` }
                                ]
                            }
                        ]
                    }),
                    signal: controller.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                        return data.candidates[0].content.parts[0].text;
                    }
                }
                throw new Error(`Gemini vrátilo status ${response.status}`);
            }
        } finally {
            clearTimeout(timeoutId);
        }

    } catch (error) {
        console.warn("[LexisAIProvider] Externí API selhalo, přepínám do offline režimu.", error);

        // PRÁVNÍ BEZPEČNOST: offline režim NIKDY nevymýšlí právní obsah.
        // Dřívější fallback vracel konkrétní paragrafy a dokonce spisové značky
        // vybírané podle klíčových slov a vydával je za „analýzu integrovaného
        // právního modelu". U nástroje pro advokáty je to riziko justičního omylu
        // (mylná nebo nesouvisející citace). Proto vracíme jen jasné upozornění,
        // že AI není dostupná — bez jakýchkoli paragrafů, judikátů či rad.
        const safeDetail = String((error && error.message) || 'neznámá chyba spojení')
            .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

        return `⚠️ <b>AI asistent je offline</b><br><br>`
            + `Nepodařilo se připojit k poskytovateli AI, takže <b>nelze provést žádnou právní analýzu</b>. `
            + `Toto <b>není</b> právní stanovisko, rešerše ani rada — offline režim záměrně negeneruje `
            + `zákonná ustanovení ani judikaturu, aby nevznikaly mylné citace.<br><br>`
            + `Pro skutečnou analýzu spusťte lokální model (<b>Ollama</b> nebo <b>LexisLocal</b>) a ověřte `
            + `poskytovatele v nastavení <i>LexisAI → AI Engine</i>, pak dotaz zopakujte.<br><br>`
            + `<span style="color:#94a3b8; font-size:12px;">Detail spojení: ${safeDetail}</span>`;
    }
};

window.LexisAIProvider = LexisAIProvider;
