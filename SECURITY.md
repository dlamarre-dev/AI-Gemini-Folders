# 🔒 Security Policy

Two extensions live in this repository — **AI Folders** and **Gemini Folders** —
and they are versioned separately.

## Supported versions

Security fixes go to the **latest release in this repository** and to whatever is
**currently published on the stores**. Anything older is not patched: browsers
update extensions automatically, so an older version is one a user has taken
deliberate steps to keep.

The three stores are not always on the same version, because each reviews
independently and a release reaches them at its own pace.

A snapshot, accurate on **04/09/2026** — the rule above is what holds, and the
numbers move:

| | AI Folders | Gemini Folders | |
|---|---|---|---|
| Latest release here | 1.7.2 | 4.6.2 | ✅ supported |
| Microsoft Edge Add-ons | 1.7.2 | 4.6.2 | ✅ supported |
| Chrome Web Store | 1.7.0 | 4.6.0 | ✅ supported |
| Firefox Add-ons (AMO) | 1.7.0 | 4.6.0 | ✅ supported |
| Anything earlier | | | ❌ not supported |

Edge is ahead only because those listings were published most recently; the next
release brings all three stores back to parity.

## Reporting a vulnerability

**Open an issue:**
<https://github.com/dlamarre-dev/AI-Gemini-Folders/issues>

Please include the extension and version, the browser and its version, and the
steps to reproduce. A proof of concept helps more than a description of one.

Issues are public, so if you believe a report would put users at risk before a fix
exists, say so in the first line and keep the details out of it — a way to send
them privately will be arranged from there.

Expect a first reply within a few days. This is a solo project, not a company
with an on-call rotation.

## What is in scope

Anything that lets a page, another extension, or a network attacker do something
the user did not ask for. Concretely, the parts worth looking at:

- **Prompt injection into the page** (`src/prompt-trigger.js`, `background.js`).
  The trigger runs as a content script in the same DOM as the site, so every
  listener gates on `event.isTrusted`. Without that, script on a supported site
  could forge the trigger and read back the whole prompt library with no user
  interaction. If you can drive an injection from the page, that is the bug to
  report.
- **Stored data reaching a page it should not** — folder names, conversation URLs,
  or prompt bodies leaking into a site's DOM or to a third party.
- **Import** (`src/utils.js`, `src/import.js`). Backup files are attacker-supplied
  by nature: URLs are validated, but a way through that check, or a crafted file
  that corrupts or overwrites unrelated data, is in scope.
- **Rendered content.** Titles and prompt text render through `textContent` and
  links through an `isSafeUrl` gate. Anything that produces script execution or a
  `javascript:` / `data:` link is a bug.
- **Permissions.** The manifests request specific hosts, and the local-LLM origin
  is requested at runtime and scoped to the address the user typed. An escalation
  beyond that is in scope.

## What is not

- Reports that a browser shows a permission warning. The host list is the feature:
  the extension cannot read a conversation title on a site it has no access to.
- Anything requiring physical access to an unlocked machine, or a browser profile
  the attacker already controls.
- Findings from an automated scan with no working path to exploitation.
- The websites the extensions run on. Report those to the site.
- Missing hardening headers on <https://aifolders.xyz>. It is a static GitHub Pages
  site that stores nothing and has no backend.

## What these extensions do with your data

The short version, because it bounds what a vulnerability could reach:

- Everything is stored in your browser's own extension storage and synced by the
  browser if you have sync on. **There is no server and no account.**
- Bookmarks permission is used only if you turn on mobile sync, and only to mirror
  your folders.
- The uninstall survey opens a page with a handful of non-identifying values in the
  **URL fragment**, which browsers never send to a server. Nothing is transmitted
  unless you press Send.
- Built on Manifest V3: the browser itself enforces that no remote code can be
  loaded. That is a platform guarantee, not a promise from us.

Full detail: <https://aifolders.xyz/privacy.html>

## Verifying a build

Every release is built from this repository by `python build.py`, and the packages
attached to each [release](https://github.com/dlamarre-dev/AI-Gemini-Folders/releases)
are the same archives submitted to the stores. Clone the tag, build, and compare —
no trust required.
