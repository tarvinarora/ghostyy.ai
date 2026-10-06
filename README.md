# Ghost Assistant 👻

A small character that floats on your Mac desktop. Click it to open your task lists. It checks in with you at **9:00, 13:00 and 18:00** every day and can sync your lists between Macs through **Google Drive**.

## Run it

```bash
cd ghost-assistant
npm install
npm install-scripts approve electron   # newer npm blocks Electron's download step
npm start
```

If `npm start` says *"Electron failed to install correctly"*, download Electron yourself:

```bash
cd node_modules/electron
curl -L -o /tmp/electron.zip https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-darwin-arm64.zip
rm -rf dist && mkdir dist && ditto -xk /tmp/electron.zip dist
printf 'Electron.app/Contents/MacOS/Electron' > path.txt
cd ../.. && npm start
```

**Updating from an older version:** unzip the new version over the old folder with `unzip -o ghost-assistant.zip -d ~`. This keeps `node_modules`, and your tasks are kept and converted to the new format automatically.

## Using it

| Action | How |
|---|---|
| Open/close your lists | Click the figurine, click the menu-bar icon, or press **⌘⇧L** from anywhere |
| Hide/show the figurine | **⌘⇧G**, the ◉ button in the panel, the switch in Settings, or right-click → Hide figurine |
| Move the figurine | Drag it |
| Change the character | Settings ⚙︎ → Figurine (Boo, Neon, Biscuit the dog, Bao the panda, Ribbit the frog, Pip the penguin) |
| Mark a task done | Click its checkbox |
| Rename or add a list | Settings ⚙︎ → Lists: click a name, type, then press Enter |
| Edit a task | Double-click it |
| Switch lists | Click a tab, or **⌘1**–**⌘9** |

When the figurine is hidden, everything else keeps working: the menu-bar icon, the shortcuts and the reminder notifications.

## Sync between two Macs (Google Drive)

Sync uses the Google Drive account signed in on your Mac. If you have more than one, pin the one to use by creating `config.local.json` next to `main.js` (it is gitignored):

```json
{ "syncAccount": "you@example.com" }
```

1. Install **Google Drive for desktop** (google.com/drive/download) on **both** Macs and sign in with the same Google account. If Drive is already signed in to another account, go to Drive's Settings → **Add another account**.
2. On the Mac that has your tasks, open Settings ⚙︎ and click **Sync with Google Drive**. macOS may ask whether Electron (or Ghost Assistant) can access files in Google Drive. Click **Allow**.
3. On the other Mac, do the same thing.

Your lists are stored in `My Drive/Ghost Assistant/tasks.json`. Changes show up on the other Mac a few seconds after Google Drive syncs them.

- Edits are merged per task, so adding a task on one Mac while checking one off on the other keeps both changes.
- When the second Mac joins, lists with the same name are combined, so you won't see two "Today" lists.
- If Google Drive ever creates a conflict copy like `tasks (1).json`, the app merges it back in and removes it.
- Each Mac keeps its own figurine position, hidden/shown setting and reminder schedule. Tasks, lists, reminder times and the chosen character are shared.

## Reminders

At each check-in time, the figurine wiggles, shows a speech bubble and sends a macOS notification. If your Mac was asleep at that time, the reminder still fires if it wakes up within 30 minutes. You can change the times in Settings ⚙︎.

## Make it a real app (optional)

```bash
npm run package
```

This creates `dist/Ghost Assistant-darwin-arm64/Ghost Assistant.app`. Drag it into **Applications** and open it. Then right-click the figurine and turn on **Launch at login**. Because the app isn't signed, macOS may block it the first time. If that happens, right-click the app, choose **Open**, then click **Open** again.

## Where things are saved

- Tasks: `~/Library/Application Support/ghost-assistant/tasks.json`, or in Google Drive when sync is on
- Settings for this Mac only: `~/Library/Application Support/ghost-assistant/local.json`
