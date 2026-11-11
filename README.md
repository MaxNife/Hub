# Hub

**Your own little app store, running on your own computer.**

Hub puts your everyday tools and games in one place. Open it in your
browser and you get a home screen with today's football, tonight's dinner
idea, your favourite apps, and a search box that opens anything in a
keystroke. It runs on your computer, so your files and settings stay with
you.

---

## About this app

### What you get

- **A home screen for your day.** The date, time, weather and your next
  calendar event at the top. Below that, today's matches for the clubs you
  follow, a dinner suggestion you can reroll, and a game to jump back into.
- **Search that opens anything.** Press `/` and type an app's name to open
  it.
- **All your apps in one place.** Browse by category, pin your
  favourites, and see what you opened recently.
- **Light and dark mode.** Switch with the moon button at the bottom of
  the sidebar.
- **Use it from your phone.** Set a password and reach Hub from your phone
  over a private connection (see *Use Hub on your phone* below).

### Apps included

| App | What it does |
| --- | --- |
| **Football** | Live scores, results, fixtures and league tables for the clubs you follow |
| **Documents** | Merge, convert, edit and sign PDFs |
| **Converter** | Units and currencies |
| **Meal picker** | Tonight's dinner, decided |
| **Random** | Dice, coins, numbers, and picking from a list |
| **Name generator** | Project names on demand |
| **Memory** | Match the pairs |
| **Reaction** | Test your reflexes |
| **Puzzle** | Sliding tiles |

Every app opens on its own home screen and has its own settings (the gear
button in the top corner).

### Your files stay yours

Hub keeps your files on your device. When Documents works on a PDF it does
the job in memory and keeps nothing on the server. Your recent files and
drafts are saved in your own browser.

### Good to know

- **Internet:** football scores, weather and currency rates need it.
  Everything else works offline.
- **Works on:** Windows, macOS and Linux, in any modern browser.
- **Cost:** free. No account and no ads.

---

## Set up Hub

This takes about 15 minutes the first time. After that, starting Hub is
one command.

### 1. Install what Hub needs

Download and install these three free tools. Accept the default options in
each installer.

| Tool | Why | Get it |
| --- | --- | --- |
| **Go** | Runs Hub itself | <https://go.dev/dl/> |
| **Node.js** (LTS version) | Builds Hub's screens | <https://nodejs.org/> |
| **Python** | Runs Football and Documents | <https://www.python.org/downloads/> (on Windows, tick **Add python.exe to PATH**) |

Optional: install **LibreOffice** (<https://www.libreoffice.org/>) if you
want Documents to turn Word, Excel or PowerPoint files into PDFs.

### 2. Download Hub

Either download the ZIP from <https://github.com/MaxNife/Hub> (green
**Code** button → **Download ZIP**) and unzip it, or run:

```
git clone https://github.com/MaxNife/Hub.git
```

### 3. Prepare it (first time only)

Open a terminal in the Hub folder. On Windows, open the folder in File
Explorer, right-click an empty space and choose **Open in Terminal**. Then
run:

```
cd web
npm install
npm run build
cd ..
pip install -r apps/documents/requirements.txt
```

### 4. Start Hub

Hub is made of three parts. Start each one in its own terminal window,
from the Hub folder, and leave the windows open:

```
go run ./cmd/hub
```
```
python apps/football/server.py
```
```
python apps/documents/server.py
```

The first start takes a minute or two while Hub gets ready.

### 5. Open it

Go to **<http://127.0.0.1:8080>** in your browser and bookmark it.

To stop Hub, close the three terminal windows (or press `Ctrl+C` in each).

---

## Make it yours

- **Weather:** Settings → *Weather and calendar*. Search for your town and
  pick °C or °F.
- **Football:** Settings → *Football*. Add your clubs and choose the
  leagues you care about.
- **Meal picker:** use *Edit list* on the dinner row to put in the meals
  you actually cook.
- **Favourites:** in *All apps*, press **Pin** on an app to keep it in
  *Favorites* in the sidebar.
- **Your calendar:** to show your next event at the top of Home, copy your
  calendar's private **iCal / ICS link** (in Google Calendar: Settings →
  your calendar → *Secret address in iCal format*). Then, before starting
  Hub, run this in the same terminal:

  ```
  $env:HUB_CALENDAR_ICS = '<your link>'      # Windows PowerShell
  export HUB_CALENDAR_ICS='<your link>'      # macOS / Linux
  ```

## Use Hub on your phone

By default only the computer running Hub can open it. To use it from your
phone:

1. **Set a password.** In the Hub folder, run `go run ./cmd/hub hash-password`,
   type a password (8 or more characters), and copy the long code it
   prints. Before starting Hub, run
   `$env:HUB_PASSWORD_HASH = '<code>'` (keep the single quotes).
2. **Connect your phone privately.** The easiest way is
   [Tailscale](https://tailscale.com/): install it on your computer and
   phone, sign in to both, then run `tailscale serve --bg 8080` on the
   computer. Tailscale shows you a private web address to open on your
   phone.

Hub asks for your password and then keeps you signed in for 30 days.

---

## Help

**The page won't open.** Check that the `go run ./cmd/hub` window is still
open and shows no error, then reload <http://127.0.0.1:8080>.

**Football or Documents says it's offline.** Its terminal window is closed
or showed an error. Start it again. Hub notices within 30 seconds, or press
**Retry**.

**Windows says it blocked `hub.exe`.** Smart App Control blocks programs it
doesn't recognise. Use `go run ./cmd/hub` as shown above instead of running
`hub.exe` directly.

**Documents can't convert Word or Excel files.** Install LibreOffice, then
restart Documents.

**Where is my data?** Hub's own settings and history are in the `data`
folder inside Hub. Your documents stay in your browser.

---

*Working on Hub's code? See [DEVELOPING.md](DEVELOPING.md).*
