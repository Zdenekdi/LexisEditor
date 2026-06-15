/**
 * LexisEditor — LexisLock
 * Správce zámku aplikace: Touch ID + heslo
 * Funguje výhradně v Electron prostředí (používá window.electronAPI)
 */
class LexisLock {
    constructor() {
        this._failedAttempts = 0;
        this._maxAttempts = 5;
        this._throttleUntil = 0;
        this._touchIdAvailable = false;
        this._config = null; // { enabled, method, touchIdEnabled, hasPassword }
        this._unlocked = false;
        this._isMac = navigator.userAgent.indexOf('Mac') >= 0;
        this._biometricName = this._isMac ? 'Touch ID' : 'Windows Hello';

        // Inicializace po načtení stránky
        window.addEventListener('DOMContentLoaded', () => this._init());
        // Pokud DOMContentLoaded již proběhlo
        if (document.readyState !== 'loading') this._init();
    }

    async _init() {
        if (!window.electronAPI) return; // Fallback: není Electron

        // Načti konfiguraci
        this._config = await window.electronAPI.lockGetConfig();

        // Zjisti Touch ID dostupnost
        const tRes = await window.electronAPI.lockTouchIdAvailable();
        this._touchIdAvailable = tRes.available;

        if (this._config.enabled) {
            this.showLockScreen();
        }
    }

    // ── LOCK SCREEN ────────────────────────────────────────────

    showLockScreen() {
        const el = document.getElementById('lock-screen');
        if (!el) return;
        el.style.display = 'flex';
        this._unlocked = false;

        // Zobraz biometrickou sekci pokud je dostupná a povolená
        const touchIdSection = document.getElementById('lock-touchid-section');
        if (touchIdSection) {
            if (this._touchIdAvailable && this._config?.touchIdEnabled) {
                touchIdSection.style.display = 'block';
                const label = document.getElementById('lock-touchid-label');
                if (label) label.textContent = this._biometricName;
                // Automaticky spusť ověření po 400ms
                setTimeout(() => this.tryTouchId(), 400);
            } else {
                touchIdSection.style.display = 'none';
            }
        }

        // Focus na heslo input
        setTimeout(() => {
            const inp = document.getElementById('lock-password-input');
            if (inp) inp.focus();
        }, 300);
    }

    hideLockScreen() {
        const el = document.getElementById('lock-screen');
        if (el) {
            el.style.animation = 'none';
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.4s ease';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '';
                el.style.transition = '';
            }, 400);
        }
        this._unlocked = true;
        this._failedAttempts = 0;
    }

    lockNow() {
        // Nelze zamknout bez nastavené konfigurace
        if (!this._config?.enabled) {
            this._showToast('⚠️ Nejprve zapněte zámek v nastavení zabezpečení.', 'warn');
            return;
        }
        if (!this._config?.hasPassword) {
            this._showToast('⚠️ Nastavte heslo v Zabezpečení → Heslo / PIN.', 'warn');
            return;
        }
        const inp = document.getElementById('lock-password-input');
        if (inp) { inp.value = ''; }
        const err = document.getElementById('lock-error-msg');
        if (err) err.style.display = 'none';
        this.showLockScreen();
        // Zavři settings modal pokud je otevřený
        this.closeSecuritySettings();
    }

    // ── TOUCH ID ──────────────────────────────────────────────

    async tryTouchId() {
        if (!window.electronAPI) return;

        const btn = document.getElementById('lock-touchid-btn');
        const icon = document.getElementById('lock-touchid-icon');
        const label = document.getElementById('lock-touchid-label');

        if (btn) btn.classList.add('scanning');
        if (label) label.textContent = `Čekám na ${this._biometricName}...`;

        try {
            const result = await window.electronAPI.authenticateBiometric('Odemknout LexisEditor');

            if (result.success) {
                if (btn) { btn.classList.remove('scanning'); btn.classList.add('success'); }
                if (icon) icon.textContent = '✅';
                if (label) label.textContent = 'Ověřeno!';
                setTimeout(() => this.hideLockScreen(), 600);
            } else {
                if (btn) { btn.classList.remove('scanning'); btn.classList.add('error'); }
                if (icon) icon.textContent = '❌';
                if (label) label.textContent = result.error || `${this._biometricName} selhalo`;
                setTimeout(() => {
                    if (btn) { btn.classList.remove('error'); }
                    if (icon) icon.textContent = '👆';
                    if (label) label.textContent = this._biometricName;
                }, 2000);
            }
        } catch (e) {
            if (btn) btn.classList.remove('scanning');
            if (label) label.textContent = `${this._biometricName} nedostupné`;
        }
    }

    // ── HESLO ─────────────────────────────────────────────────

    async tryPassword() {
        if (!window.electronAPI) return;

        // Throttle po max pokusech
        if (this._failedAttempts >= this._maxAttempts) {
            const remaining = Math.ceil((this._throttleUntil - Date.now()) / 1000);
            if (remaining > 0) {
                this._setError(`Příliš mnoho pokusů. Zkuste za ${remaining}s.`);
                return;
            }
            this._failedAttempts = 0;
        }

        const inp = document.getElementById('lock-password-input');
        const password = inp?.value?.trim() || '';

        if (!password) {
            this._setError('Zadejte heslo.');
            if (inp) { inp.style.borderColor = 'rgba(239,68,68,0.7)'; setTimeout(() => { inp.style.borderColor = 'rgba(255,255,255,0.15)'; }, 1500); }
            return;
        }

        const btn = document.getElementById('lock-unlock-btn');
        if (btn) { btn.textContent = '⏳ Ověřuji...'; btn.disabled = true; }

        const result = await window.electronAPI.lockVerifyPassword(password);

        if (result.success) {
            this._clearError();
            if (btn) { btn.textContent = '✅ Odemknuto!'; }
            setTimeout(() => this.hideLockScreen(), 400);
        } else {
            this._failedAttempts++;
            if (btn) { btn.textContent = '🔓 Odemknout'; btn.disabled = false; }

            if (this._failedAttempts >= this._maxAttempts) {
                this._throttleUntil = Date.now() + 30000; // 30s blokace
                this._setError(`Příliš mnoho špatných pokusů. Zablokováno na 30s.`);
                this._startThrottleCountdown();
            } else {
                const remaining = this._maxAttempts - this._failedAttempts;
                this._setError(`Nesprávné heslo. Zbývá ${remaining} ${remaining === 1 ? 'pokus' : 'pokusy'}.`);
                // Zatřes inputem
                if (inp) {
                    inp.style.animation = 'none';
                    setTimeout(() => { inp.style.animation = ''; }, 10);
                    inp.value = '';
                    inp.focus();
                }
            }
        }
    }

    _setError(msg) {
        const el = document.getElementById('lock-error-msg');
        if (el) { el.textContent = `❌ ${msg}`; el.style.display = 'block'; }
    }

    _clearError() {
        const el = document.getElementById('lock-error-msg');
        if (el) el.style.display = 'none';
    }

    _startThrottleCountdown() {
        const el = document.getElementById('lock-attempts');
        if (!el) return;
        el.style.display = 'block';

        const tick = () => {
            const remaining = Math.ceil((this._throttleUntil - Date.now()) / 1000);
            if (remaining > 0) {
                el.textContent = `Zkuste za ${remaining}s`;
                setTimeout(tick, 1000);
            } else {
                el.style.display = 'none';
                this._failedAttempts = 0;
                this._clearError();
                const btn = document.getElementById('lock-unlock-btn');
                if (btn) btn.disabled = false;
            }
        };
        tick();
    }

    togglePasswordVisibility() {
        const inp = document.getElementById('lock-password-input');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    // ── SECURITY SETTINGS ─────────────────────────────────────

    async openSecuritySettings() {
        const overlay = document.getElementById('security-settings-overlay');
        if (!overlay) return;

        // Načti aktuální config
        if (window.electronAPI) {
            this._config = await window.electronAPI.lockGetConfig();
        }

        // Nastav stav toggles
        const enabledCb = document.getElementById('sec-lock-enabled');
        if (enabledCb) enabledCb.checked = this._config?.enabled || false;

        const settingsBody = document.getElementById('sec-settings-body');
        if (settingsBody) settingsBody.style.display = this._config?.enabled ? 'flex' : 'none';

        // Touch ID / Windows Hello row
        const touchIdRow = document.getElementById('sec-touchid-row');
        const touchIdCb = document.getElementById('sec-touchid-enabled');
        const touchIdStatus = document.getElementById('sec-touchid-status');
        const touchIdTitle = document.getElementById('sec-touchid-title');
        if (touchIdRow) touchIdRow.style.display = this._touchIdAvailable ? 'block' : 'none';
        if (touchIdCb) touchIdCb.checked = this._config?.touchIdEnabled || false;
        if (touchIdTitle) touchIdTitle.textContent = this._biometricName;
        if (touchIdStatus) {
            touchIdStatus.textContent = this._touchIdAvailable 
                ? (this._isMac ? 'Touch ID je dostupné na tomto Macu.' : 'Windows Hello je dostupné na tomto zařízení.')
                : (this._isMac ? 'Touch ID není dostupné.' : 'Windows Hello není dostupné.');
        }

        // Heslo
        const hasPassEl = document.getElementById('sec-has-password');
        if (hasPassEl) hasPassEl.style.display = this._config?.hasPassword ? 'block' : 'none';

        // Vymaž password pole
        const p1 = document.getElementById('sec-new-password');
        const p2 = document.getElementById('sec-confirm-password');
        const hint = document.getElementById('sec-password-hint');
        if (p1) p1.value = '';
        if (p2) p2.value = '';
        if (hint) hint.textContent = '';

        overlay.style.display = 'flex';
    }

    closeSecuritySettings() {
        const overlay = document.getElementById('security-settings-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async onLockToggle(enabled) {
        const settingsBody = document.getElementById('sec-settings-body');
        if (settingsBody) settingsBody.style.display = enabled ? 'flex' : 'none';

        if (!window.electronAPI) return;

        if (!enabled) {
            // Vypnout zámek
            await window.electronAPI.lockDeleteConfig();
            this._config = { enabled: false, method: 'password', touchIdEnabled: false, hasPassword: false };
            this._showToast('🔓 Zámek aplikace byl vypnut.', 'info');
        } else {
            // Zapnout zámek — uložit enabled:true ale bez hesla (požádáme o heslo)
            await window.electronAPI.lockSaveConfig({ enabled: true, method: 'password', touchIdEnabled: false });
            this._config = { enabled: true, method: 'password', touchIdEnabled: false, hasPassword: false };
            this._showToast('🔐 Zámek zapnut. Nastavte heslo níže.', 'info');

            // Zvýrazni password sekci
            const p1 = document.getElementById('sec-new-password');
            if (p1) { p1.focus(); p1.style.borderColor = '#6366f1'; setTimeout(() => { p1.style.borderColor = '#e2e8f0'; }, 2000); }
        }
    }

    async onTouchIdToggle(enabled) {
        if (!window.electronAPI) return;
        await window.electronAPI.lockSaveConfig({
            enabled: this._config?.enabled ?? true,
            method: enabled ? 'both' : 'password',
            touchIdEnabled: enabled
        });
        if (this._config) this._config.touchIdEnabled = enabled;
        this._showToast(enabled ? `👆 ${this._biometricName} povoleno.` : `👆 ${this._biometricName} vypnuto.`, 'info');
    }

    async savePassword() {
        const p1 = document.getElementById('sec-new-password')?.value?.trim() || '';
        const p2 = document.getElementById('sec-confirm-password')?.value?.trim() || '';
        const hint = document.getElementById('sec-password-hint');

        if (!p1) {
            if (hint) { hint.textContent = '⚠️ Zadejte heslo.'; hint.style.color = '#f87171'; }
            return;
        }
        if (p1.length < 4) {
            if (hint) { hint.textContent = '⚠️ Heslo musí mít alespoň 4 znaky.'; hint.style.color = '#f87171'; }
            return;
        }
        if (p1 !== p2) {
            if (hint) { hint.textContent = '⚠️ Hesla se neshodují.'; hint.style.color = '#f87171'; }
            return;
        }

        if (!window.electronAPI) {
            if (hint) { hint.textContent = '⚠️ Electron API není dostupné.'; hint.style.color = '#f87171'; }
            return;
        }

        const result = await window.electronAPI.lockSaveConfig({
            enabled: true,
            method: this._config?.touchIdEnabled ? 'both' : 'password',
            touchIdEnabled: this._config?.touchIdEnabled || false,
            password: p1
        });

        if (result.success) {
            this._config = await window.electronAPI.lockGetConfig();
            if (hint) { hint.textContent = '✅ Heslo bylo nastaveno.'; hint.style.color = '#10b981'; }

            // Aktualizuj stav "heslo nastaveno"
            const hasPassEl = document.getElementById('sec-has-password');
            if (hasPassEl) hasPassEl.style.display = 'block';

            // Vymaž pole
            const p1El = document.getElementById('sec-new-password');
            const p2El = document.getElementById('sec-confirm-password');
            if (p1El) p1El.value = '';
            if (p2El) p2El.value = '';

            this._showToast('✅ Heslo bylo úspěšně nastaveno.', 'success');

            setTimeout(() => { if (hint) hint.textContent = ''; }, 3000);
        } else {
            if (hint) { hint.textContent = `❌ Chyba: ${result.error}`; hint.style.color = '#f87171'; }
        }
    }

    // ── TOAST NOTIFICATION ────────────────────────────────────

    _showToast(msg, type = 'info') {
        const colors = { info: '#6366f1', success: '#10b981', warn: '#f59e0b', error: '#ef4444' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed;bottom:24px;right:24px;z-index:99998;
            padding:12px 20px;border-radius:12px;
            background:${colors[type] || colors.info};color:white;
            font-size:13px;font-weight:700;
            box-shadow:0 8px 24px rgba(0,0,0,0.2);
            animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);
            max-width:320px;line-height:1.4;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Inicializace globální instance
const lockScreen = new LexisLock();
window.lockScreen = lockScreen;
