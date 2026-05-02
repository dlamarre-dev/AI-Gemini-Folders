# 📁 Gemini Folders - Browser Extension

![Gemini Folders Hero Image](Marketing/screenshots/Promo_1_en.png)

**Gemini Folders** is a lightweight, multilingual browser extension that lets you organize your Google Gemini conversations into custom folders **and** build a personal prompt library. Stop losing your best ideas in an endless history—build a structured workspace accessible from any device, and inject your saved prompts directly into Gemini with a single click.

[![Available in the Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/gemini-folders/jffchdehoapigpmifkmleglfimjiilik)
[![Available on Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-Available-orange?logo=firefox)](https://addons.mozilla.org/firefox/addon/gemini_folders/) 

## ✨ Features

### 📁 Folder Manager

* 📱 **Mobile Sync (Bookmarks Bridge):** Access your conversations on the go! Toggle the mobile sync to create a smart, one-way synced folder in your browser's bookmarks. It perfectly mirrors your extension's layout and **your custom sort order** right on your phone.
* ⚡ **Quick Save (Context Menu & Shortcuts):** Save the current conversation directly to any folder using the right-click menu, or use the global keyboard shortcut (`Ctrl+Shift+S` or `Alt+Shift+S` on Firefox) to instantly send it to a "⚡ Quick Saves" folder. Includes smart visual alerts (toasts) to let you know if a conversation is already saved!
* 🛡️ **Bulletproof Database & Smart Deduplication:** Your database is shielded against corruption with a secure fallback architecture. Plus, our smart URL normalization ensures you never get false duplicates even if Gemini changes its URL parameters.
* ☑️ **Bulk Actions (Multi-Select):** Select multiple conversations at once using checkboxes to move or delete them in batches, saving you tons of clicks.
* 📑 **Tab Groups Integration:** Open an entire folder of conversations with a single click. They will automatically open in native, color-coded browser Tab Groups (where supported) for ultimate project management.
* 😃 **Custom Folder Emojis:** Start your folder name with an emoji (e.g., "💻 Code" or "🌍 Travel") and the extension will automatically use it as the folder's icon instead of the default one.
* ⇅ **Custom Sorting:** Sort your folders and saved conversations on the fly by Newest, Oldest, or Alphabetically (A-Z) using the dedicated dropdown menu, **with changes reflecting instantly in your mobile sync**.
* 🖱️ **Drag & Drop:** Easily move saved conversations between folders to reorganize your workspace intuitively.
* 🗜️ **Ultra-Efficient Compression:** Automatically compresses your synced data using LZString, maximizing your browser's native storage capacity so you can save hundreds of conversations securely.
* 📊 **Storage Tracker:** A sleek visual progress bar keeps you informed of your available cloud storage capacity in real-time, complete with detailed tooltips.
* 🎨 **Modern Material UI:** Enjoy a fully seamless experience with custom Material 3 modal dialogs (no more native browser popups!), a sleek ultra-compact footer, a collapsible "Add" panel, and clean hover effects.
* 📁 **Smart Folders:** Group your chats by projects, themes, or categories. Create empty folders in advance and manage them easily.
* 📌 **Pin Favorites:** Pin your most important folders to the top of the list for ultra-fast access.
* 🤖 **Smart Title Detection:** No more typing! The extension automatically reads the Gemini interface to extract the exact name of your current conversation in the background.
* 🔍 **Instant Search:** Find any conversation quickly with a real-time search bar.
* ☁️ **Cloud Sync:** Uses native `storage.sync` to keep your folders synchronized across all devices connected to your browser profile.
* 💾 **Import / Export:** Easily backup and restore your folder structure (including pinned folders) via JSON files.
* 🌍 **Multilingual & Adaptive:** Automatically detects your browser language (now supporting **16 languages** worldwide!) and matches your system's Dark/Light mode.
* 🤝 **Open Source & Modular:** Fully transparent, refactored code with a clean, modular architecture (separated UI, data logic, and styling) making it easier than ever for the community to contribute. A dynamic GitHub version link is integrated right into the extension's footer.

### 📝 Prompt Manager

* 📝 **Prompt Library:** Switch to Prompt Mode using the pill toggle in the header. Save any reusable prompt with a title and full text, then find it instantly with search and sort (newest, oldest, A-Z).
* ▶ **One-Click Injection:** Hit the play button on any saved prompt to inject it directly into the active Gemini tab's input field—no copy-pasting required. The extension detects whether you're on Gemini and notifies you if not.
* ✏️ **Inline Editing:** Click a prompt to expand it and edit the text directly. Changes auto-save after a short pause and the sort order updates to reflect the latest modification.
* 💎 **Custom Gem Link:** Configure a custom Gemini Gem URL and toggle it on/off with the 💎 button. When active, the "New Conversation" button opens your Gem instead of the default chat.
* 📌 **Pin Important Prompts:** Pin your most-used prompts to keep them at the top of your library. A visual divider separates pinned from unpinned prompts, and the active sort order applies independently within each group.
* ☁️ **Prompt Sync:** Enable cloud sync for your prompt library independently from your folders, keeping your prompts available across all your devices.


## 🚀 Installation

### Option 1: Official Stores (Recommended)
You can install the official, auto-updating version directly from your browser's extension store:
👉 **[Install for Google Chrome](https://chromewebstore.google.com/detail/gemini-folders/jffchdehoapigpmifkmleglfimjiilik)**
👉 **[Install for Mozilla Firefox](#)** 

### Option 2: Developer Mode (Manual Installation)
If you want to test the code locally or contribute to the project, this extension uses a Python build pipeline to generate browser-specific versions:

1. Clone or download this repository.
2. Ensure you have Python installed, then run the build script from the root directory:
   ```bash
   python build.py
   ```
3. **For Chrome:** * Navigate to `chrome://extensions/`.
   * Enable **Developer mode** (top right).
   * Click **Load unpacked** and select the generated `dist/chrome/` directory.
4. **For Firefox:** * Navigate to `about:debugging`.
   * Click on **This Firefox**.
   * Click **Load Temporary Add-on...** and select the `manifest.json` file inside the generated `dist/firefox/` directory.

## 🛠️ Usage

### Folder Mode
1. Open a conversation on [gemini.google.com](https://gemini.google.com).
2. **To save instantly:** Press the keyboard shortcut (`Ctrl+Shift+S` on Chrome, `Alt+Shift+S` on Firefox) to save to Quick Saves, or right-click anywhere on the page and hover over "Save to Gemini Folders".
3. **To save via the Extension:** Click the **Gemini Folders** icon in your toolbar. The title is automatically detected. Expand the add panel (➕), select or create a folder, and hit **Save**.
4. **To sync with Mobile:** Click the `📱` toggle in the extension's footer to automatically mirror your folders in your browser's bookmarks.
5. Drag and drop items, use checkboxes for bulk actions, open folders as Tab Groups (📑), or use the 📌 icon to pin your favorites!

### Prompt Mode
1. Click the **📝** side of the pill toggle in the extension header to switch to Prompt Mode.
2. **To save a prompt:** Click **➕ Add Prompt**, enter a title and your prompt text, then hit **Save**.
3. **To use a prompt:** Click any saved prompt to expand it, then hit **▶** to inject it directly into your active Gemini tab. The input field will be pre-filled and ready to submit.
4. **To set up a Gem:** Click 💎, paste your custom Gem URL, and confirm. The button will highlight in blue when active. Use **💬** to open a new conversation (in your Gem if active, or standard Gemini otherwise).
5. **To pin a prompt:** Click the 📍 icon on any prompt to pin it (📌). It moves to the top of the list above the visual divider, regardless of the active sort order.
6. Search and sort your prompts, rename or edit them inline—all changes sync automatically.

## 🔒 Privacy & Security

This extension is built with privacy in mind. 
* It **only** requests access to the `gemini.google.com` domain and the context menu.
* It requires the `bookmarks` permission strictly to create and manage the "Gemini Folders (Sync)" folder if you enable the Mobile Sync feature.
* It dynamically reads the active tab's content **only** when you explicitly save a conversation to generate a title.
* All data is stored using your browser's built-in sync storage. **No third-party servers** or tracking tools are used, and your data remains entirely yours.

## 💻 Built With

* HTML5 / CSS3 (Separated Stylesheets)
* Vanilla JavaScript (Modular Architecture: UI, Logic, Bulk Actions)
* WebExtensions API (Manifest V3)
* Service Workers / Event Pages (Background Scripts)
* LZ-String (Data Compression)
* Python (Cross-browser Build Automation)
