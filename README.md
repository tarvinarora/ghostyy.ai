<p align="center">
  <img src="assets/banner.svg" alt="ghostyy.ai" width="100%">
</p>

<p align="center">
  A small character that floats on your Mac desktop, keeps your task lists and helps you get through them.
</p>

<p align="center">
  <a href="#new-in-13"><b>New in 1.3</b></a> ·
  <a href="#features"><b>Features</b></a> ·
  <a href="#run-it"><b>Run it</b></a> ·
  <a href="#using-it"><b>Using it</b></a> ·
  <a href="#sync-between-two-macs"><b>Sync</b></a> ·
  <a href="#your-day-with-the-ghost"><b>Your day</b></a> ·
  <a href="#make-it-a-real-app"><b>Install</b></a> ·
  <a href="#updates"><b>Updates</b></a>
</p>

https://github.com/user-attachments/assets/8c03838a-417f-478f-bbf4-6694f103fca1

<p align="center">
  <a href="https://github.com/tarvinarora/ghostyy.ai/releases/latest"><b>Download for Mac</b></a> (Apple Silicon)
</p>

## New in 1.3

### Drop anything on the ghost

Drag selected text, a link or a file onto the figurine and it becomes a task. It lands in your **Today** list, or your first list if you don't have one.

| You drop | You get |
|---|---|
| Selected text | A task with that text |
| A link | A task named after the link, with an **Open link** button |
| A file | A task with the file's name, with a **Show file** button |

### Break it down

Right-click a big task and choose **Break it down**. Gemini splits it into two to six small steps, listed underneath the task. Finish the last step and the task checks itself off.

This one needs a [Gemini API key](#add-your-gemini-key). The drop feature doesn't.

### Also new

- **Morning plan:** the ghost suggests the three tasks to do first.
- **Evening recap:** see what you finished and what carries over.
- **Focus timer:** the ghost puts on headphones for 25 minutes, then stretches and celebrates.
- **Due times:** a nudge 15 minutes before a task is due.
- **One-command install:** `npm run package` builds the app and installs it.
- **Auto-update:** new versions download from GitHub releases.
- **A new look:** the app now uses the Bricolage Grotesque font.

## Features

<table>
  <tr>
    <td width="33%" valign="top"><b>Lives on your desktop</b><br>Click the figurine to open your lists. Hide it and the menu-bar icon keeps working.</td>
    <td width="33%" valign="top"><b>Nags you three times a day</b><br>Checks in at 9:00, 13:00 and 18:00. You can change the times.</td>
    <td width="33%" valign="top"><b>Syncs between Macs</b><br>Lists merge task by task through Google Drive, so nothing gets overwritten.</td>
  </tr>
  <tr>
    <td valign="top"><b>Six characters</b><br>Boo, Neon, Biscuit the dog, Bao the panda, Ribbit the frog and Pip the penguin.</td>
    <td valign="top"><b>Celebrates with you</b><br>The figurine's eyes turn happy when every task is done.</td>
    <td valign="top"><b>Yours only</b><br>Tasks stay in a local file or in your own Drive folder. With a Gemini key, task names go to Google only for the morning plan and Break it down.</td>
  </tr>
  <tr>
    <td valign="top"><b>Takes anything you drop on it</b><br>Text, links and files become tasks.</td>
    <td valign="top"><b>Breaks big tasks down</b><br>Right-click a task and Gemini splits it into small steps.</td>
    <td valign="top"><b>Plans your morning</b><br>Suggests the three tasks to do first at the 9:00 check-in.</td>
  </tr>
  <tr>
    <td valign="top"><b>Recaps your evening</b><br>Says what you finished and what carries over.</td>
    <td valign="top"><b>Focuses with you</b><br>Headphones on for 25 minutes, then a stretch and a celebration.</td>
    <td valign="top"><b>Watches due times</b><br>Nudges you 15 minutes before a task is due.</td>
  </tr>
</table>

## Run it

```bash
git clone https://github.com/tarvinarora/ghostyy.ai.git
cd ghostyy.ai
npm install
npm install-scripts approve electron   # newer npm blocks Electron's download step
npm start
```

### Add your Gemini key

Get a key from [Google AI Studio](https://aistudio.google.com/apikey) and paste it into `.env`, next to `main.js`:

```bash
GEMINI_API_KEY=your-key-here
```

Copy `.env.example` to `.env` if you don't have one yet. `.env` is gitignored and never goes into a build. Without a key everything still works, except that morning plans use a simple ranking and **Break it down** is off.

<details>
<summary><b><code>npm start</code> says "Electron failed to install correctly"</b></summary>

<br>

Download Electron yourself:

```bash
cd node_modules/electron
curl -L -o /tmp/electron.zip https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-darwin-arm64.zip
rm -rf dist && mkdir dist && ditto -xk /tmp/electron.zip dist
printf 'Electron.app/Contents/MacOS/Electron' > path.txt
cd ../.. && npm start
```

</details>

<details>
<summary><b>Updating from an older version</b></summary>

<br>

Run `git pull`, or unzip the new version over the old folder with `unzip -o ghost-assistant.zip -d ~`. Either way `node_modules` is kept, and your tasks are kept and converted to the new format automatically.

</details>

## Using it

| Action | How |
|---|---|
| Open/close your lists | Click the figurine, click the menu-bar icon, or press **⌘⇧L** from anywhere |
| Hide/show the figurine | **⌘⇧G**, the ◉ button in the panel, the switch in Settings, or right-click → Hide figurine |
| Move the figurine | Drag it |
| Change the character | Settings ⚙︎ → Figurine |
| Mark a task done | Click its checkbox |
| Rename or add a list | Settings ⚙︎ → Lists: click a name, type, then press Enter |
| Edit a task | Double-click it |
| Break a task into steps | Right-click it → **Break it down** |
| Set a due time | Right-click it → **Set due time** |
| Add a task from another app | Drag selected text, a link or a file onto the figurine |
| Start or stop a focus timer | The ⏱ button in the panel, or right-click the figurine |
| Switch lists | Click a tab, or **⌘1**–**⌘9** |

When the figurine is hidden, everything else keeps working: the menu-bar icon, the shortcuts and the reminder notifications.

## Sync between two Macs

Sync goes through **Google Drive for desktop**, using the account signed in on your Mac.

1. Install **Google Drive for desktop** (google.com/drive/download) on **both** Macs and sign in with the same Google account. If Drive is already signed in to another account, go to Drive's Settings → **Add another account**.
2. On the Mac that has your tasks, open Settings ⚙︎ and click **Sync with Google Drive**. macOS may ask whether Electron (or Ghost Assistant) can access files in Google Drive. Click **Allow**.
3. On the other Mac, do the same thing.

Your lists are stored in `My Drive/Ghost Assistant/tasks.json`. Changes show up on the other Mac a few seconds after Google Drive syncs them.

<details>
<summary><b>More than one Google account on your Mac?</b></summary>

<br>

Pin the one to use by creating `config.local.json` next to `main.js` (it is gitignored):

```json
{ "syncAccount": "you@example.com" }
```

</details>

<details>
<summary><b>How merging works</b></summary>

<br>

- Edits are merged per task, so adding a task on one Mac while checking one off on the other keeps both changes.
- When the second Mac joins, lists with the same name are combined, so you won't see two "Today" lists.
- If Google Drive ever creates a conflict copy like `tasks (1).json`, the app merges it back in and removes it.
- Each Mac keeps its own figurine position, hidden/shown setting and reminder schedule. Tasks, lists, reminder times and the chosen character are shared.

</details>

## Your day with the ghost

At each check-in time, the figurine wiggles, shows a speech bubble and sends a macOS notification. If your Mac was asleep at that time, the reminder still fires if it wakes up within 30 minutes. You can change the times in Settings ⚙︎.

- **Morning plan:** the first check-in before noon suggests three tasks, which stay at the top of the panel under **First up today**. With three tasks or fewer, or without a key, the app chooses them itself: soonest due, then your Today list, then oldest.
- **Evening recap:** the first check-in from 17:00 on lists what you finished and what carries over. It's worked out on your Mac, so it doesn't need a key.
- **Due times:** you get one nudge 15 minutes before a task is due. Change `NUDGE_BEFORE_MIN` in `main.js` to adjust that.
- **Focus timer:** check-ins and water breaks wait until the 25 minutes are up. Due-time nudges still come through.

**Plan my day now** and **Recap my day now** are in the figurine's right-click menu.

## Water breaks

Every 60 minutes the figurine gets thirsty: it droops, fades a little and a glass with a striped straw appears beside it. Click the glass and it takes a drink, perks up, and the 60 minutes start again. Nothing is tracked or counted.

If the figurine is hidden you just get a quiet notification each hour. To see it straight away, right-click the figurine and choose **Offer water now**. The interval is `WATER_EVERY_MIN` in `main.js`.

## Make it a real app

```bash
npm run package
```

This one command builds the app, quits the running copy, installs the new one in **Applications** and opens it. It also copies your `.env` into the app's data folder, so run it again if you change your key. Then right-click the figurine and turn on **Launch at login**.

Because the app isn't signed, macOS may block a downloaded copy the first time. If that happens, right-click the app, choose **Open**, then click **Open** again.

## Updates

The installed app checks this repo's GitHub releases at launch and every 6 hours. When a newer version is ready it tells you, and you choose when to restart from the figurine's right-click menu or Settings ⚙︎.

To publish a version, bump `version` in `package.json`, then run:

```bash
npm run release
```

This repo is public, so releases are too. The build refuses to go out if it contains `.env`, `config.local.json` or either file's values.

## Where things are saved

- Tasks: `~/Library/Application Support/Ghost Assistant/tasks.json`, or in Google Drive when sync is on
- Settings for this Mac only: `~/Library/Application Support/Ghost Assistant/local.json`
- Your Gemini key in the installed app: `~/Library/Application Support/Ghost Assistant/.env`
