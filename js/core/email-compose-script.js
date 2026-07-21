// --- email-compose-script — generátory skriptů pro „nové okno pošty s přílohou" ---
// mailto neumí přílohu; tohle vygeneruje skript, který otevře OKNO rozepsané
// zprávy v konkrétním klientu s předvyplněnými poli A připojenou přílohou:
//   • macOS  → AppleScript pro Apple Mail (osascript),
//   • Windows → PowerShell + Outlook COM.
// Okno se jen ZOBRAZÍ (neodesílá) — advokát zkontroluje a odešle sám.
// Čisté funkce (escapování) jsou testovatelné bez Electronu.

'use strict';

// Escapování do AppleScript řetězce ("..."): zpětné lomítko a uvozovka.
function escAppleScript(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Tělo (víceřádkové) jako AppleScript výraz: "l1" & return & "l2".
function appleContentExpr(body) {
    const lines = String(body == null ? '' : body).replace(/\r/g, '').split('\n');
    return lines.map(l => '"' + escAppleScript(l) + '"').join(' & return & ');
}

function buildAppleMailScript(opts) {
    const o = opts || {};
    const paths = (o.attachmentPaths || []).filter(Boolean);
    const attachLines = paths.map(p =>
        `\t\tmake new attachment with properties {file name:(POSIX file "${escAppleScript(p)}")} at after the last paragraph`
    ).join('\n');
    return [
        'tell application "Mail"',
        `\tset newMessage to make new outgoing message with properties {subject:"${escAppleScript(o.subject)}", visible:true}`,
        `\tset content of newMessage to ${appleContentExpr(o.body)}`,
        '\ttell newMessage',
        `\t\tmake new to recipient at end of to recipients with properties {address:"${escAppleScript(o.to)}"}`,
        attachLines ? '\t\ttell content' : '',
        attachLines,
        attachLines ? '\t\tend tell' : '',
        '\tend tell',
        '\tactivate',
        'end tell'
    ].filter(l => l !== '').join('\n');
}

// Escapování do PowerShell single-quoted řetězce ('...'): apostrof → ''.
function escPsSingle(s) {
    return String(s == null ? '' : s).replace(/'/g, "''");
}

function buildOutlookPowershell(opts) {
    const o = opts || {};
    const paths = (o.attachmentPaths || []).filter(Boolean);
    const attachLines = paths.map(p => `$mail.Attachments.Add('${escPsSingle(p)}') | Out-Null`).join('\n');
    return [
        '$ErrorActionPreference = "Stop"',
        '$outlook = New-Object -ComObject Outlook.Application',
        '$mail = $outlook.CreateItem(0)',
        `$mail.To = '${escPsSingle(o.to)}'`,
        `$mail.Subject = '${escPsSingle(o.subject)}'`,
        `$mail.Body = '${escPsSingle(o.body)}'`,
        attachLines,
        '$mail.Display($false)'
    ].filter(l => l !== '').join('\n');
}

module.exports = {
    escAppleScript,
    appleContentExpr,
    buildAppleMailScript,
    escPsSingle,
    buildOutlookPowershell
};
