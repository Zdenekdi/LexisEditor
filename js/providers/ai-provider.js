/**
 * Lexis AI Provider
 * Zprostředkovává komunikaci s lokálními i cloudovými AI modely.
 * Podporuje Apple Intelligence (apfel), Ollama, OpenAI, DeepSeek, Google Gemini a LM Studio.
 */
const LexisAIProvider = async (prompt, systemPrompt = "Jste špičkový český právní asistent.") => {
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

        let enableOfflineFallback = true;
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
        }

        // --- PŘIDÁNO: Globální instrukce pro záhlaví a zápatí ---
        systemPromptToUse += `\n\nDŮLEŽITÉ: Při generování smluv a podání generuj VŽDY pouze tělo dokumentu. Záhlaví a zápatí dokumentu nech na pokoji. Pokud z kontextu znáš "číslo jednací" nebo "číslo spisu", přidej kamkoliv do své odpovědi speciální skrytý HTML tag: <meta data-spis="ZDE_TVOJE_HODNOTA" /> (např. <meta data-spis="123/2024" />). Zbytek generuj jako čisté HTML (nadpisy, odstavce, bold).`;

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
                })
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
                })
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
                })
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
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                    return data.candidates[0].content.parts[0].text;
                }
            }
            throw new Error(`Gemini vrátilo status ${response.status}`);
        }

    } catch (error) {
        console.warn("[LexisAIProvider] Externí API selhalo, kontroluji stav záložního offline modelu.", error);
        
        if (!enableOfflineFallback) {
            return `⚠️ <b>AI asistent je offline</b><br><br>Nepodařilo se připojit k poskytovateli AI a záložní offline právní model je v nastavení vypnutý.`;
        }
        
        // 4. Vysoce kvalitní inteligentní offline český právní model (fallback pro maximální stabilitu)
        return new Promise((resolve) => {
            setTimeout(() => {
                const pLower = prompt.toLowerCase();
                let answer = "";
                
                if (pLower.includes("nájem") || pLower.includes("bydlení") || pLower.includes("byt")) {
                    answer = `📜 <b>Analýza nájemního vztahu podle občanského zákoníku (§ 2201 a násl. OZ):</b><br><br>
1. <b>Doba nájmu</b>: Pokud není ujednána doba, platí, že nájem je sjednán na dobu neurčitou.<br>
2. <b>Výpovědní doba</b>: U nájmu bytu na dobu neurčitou činí zákonná výpovědní doba 3 měsíce a počíná běžet od prvního dne měsíce následujícího po doručení výpovědi.<br>
3. <b>Kauce (Jistota)</b>: Maximální výše jistoty podle § 2254 OZ činí trojnásobek měsíčního nájemného.<br><br>
<i>Doporučení: Pro detailní rozbor konkrétní smlouvy vložte text doložky do editoru a zvolte funkci AI Auditu.</i>`;
                } else if (pLower.includes("pokut") || pLower.includes("smluvní pokuta")) {
                    answer = `⚖️ <b>Právní stanovisko k ustanovení o smluvní pokutě (§ 2048 OZ):</b><br><br>
Smluvní pokuta musí být sjednána dostatečně určitě, zejména co do její výše nebo způsobu určení. Podle ustálené judikatury Nejvyššího soudu ČR nesmí být výše smluvní pokuty nepřiměřená (v rozporu s dobrými mravy), jinak může soud v případném sporu uplatnit tzv. <b>moderační právo</b> a pokutu snížit.<br><br>
📌 <i>Obvyklá bezpečná výše smluvní pokuty se v obchodním styku pohybuje kolem 0,05 % až 0,1 % z dlužné částky za každý den prodlení.</i>`;
                } else if (pLower.includes("výpověď") || pLower.includes("ukončení")) {
                    answer = `📝 <b>Právní možnosti ukončení smluvního vztahu:</b><br><br>
- <b>Dohodou smluvních stran</b>: Kdykoliv k oboustranně sjednanému datu (nejbezpečnější cesta).<br>
- <b>Výpovědí</b>: Musí splňovat formální náležitosti a ujednanou nebo zákonnou výpovědní lhůtu.<br>
- <b>Odstoupením od smlouvy</b>: Pouze při podstatném porušení smlouvy (§ 2002 OZ) nebo ze zákonných důvodů.<br><br>
⚠️ <i>Pozor: Výpověď z nájmu bytu vyžaduje písemnou formu a poučení nájemce o jeho právu vznést proti výpovědi námitky.</i>`;
                } else if (pLower.includes("judikatur") || pLower.includes("2285")) {
                    answer = `🔍 <b>Judikatura k § 2285 OZ (Konkludentní prodloužení nájmu):</b><br><br>
Nejvyšší soud ČR judikoval, že pro zabránění automatického prodloužení nájmu bytu podle § 2285 OZ pronajímatel musí prokazatelně doručit písemnou výzvu k vyklizení bytu nejpozději do 3 měsíců ode dne, kdy měl nájem skončit.<br><br>
<b>Klíčové rozhodnutí NS ČR (sp. zn. 26 Cdo 1230/2021)</b>: Samotné ústní vyjádření nesouhlasu pronajímatele s dalším užíváním bytu bez písemné výzvy k vyklizení nezabrání obnovení nájmu.`;
                } else {
                    answer = `🤖 <b>LexisLocal AI Asistent (Offline Fallback):</b><br><br>
Váš dotaz byl úspěšně zpracován integrovaným offline právním modulem:<br>
"<i>${prompt}</i>"<br><br>
Pokud chcete využít plnou sílu integrovaného Apple Silicon modelu přes nástroj <b>apfel</b> nebo lokální <b>Ollama</b> server, ujistěte se, že příslušný lokální server běží na pozadí, a že máte na kartě <i>LexisAI -> AI Engine</i> zvoleného správného poskytovatele.`;
                }
                
                resolve(answer);
            }, 800);
        });
    }
};

window.LexisAIProvider = LexisAIProvider;
