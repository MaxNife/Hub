# Hub — notes for coding agents

Project overview and run instructions: `README.md`. Build progress and
environment gotchas: `memory.md`.

## Apps, games and widgets

- A widget (a row on Hub's Home, like the football carousel) only has
  settings, and those live in Hub.
- An app or game is different: it needs its own personalized home
  screen and its own settings, as it would if it were installed on its
  own. Build them with `appkit/app-kit.js` (games add
  `appkit/game-kit.js`), then run `python appkit/sync.py`.
- An app's settings are separate from its widget's settings.
- User files belong on the user's device. Documents' server must stay
  stateless: never write uploads or results to it. Transcribe keeps a
  recording only while transcribing it, and a transcript only until the
  browser collects it; both are then deleted from the server.

## Commits

- Follow the 50/72 rule: subject line at most 50 characters, a blank
  line, then a body wrapped at 72 characters. Keep bodies short.
- Write the subject in the imperative ("Add dark mode", not "Added").

## Attribution

- Never list Claude (or any AI agent) as an author, committer or
  co-author. Commit with the repo owner's git identity (MaxNife).
- No `Co-Authored-By: Claude`, `Claude-Session:` or other Claude lines
  in commit messages.
- No "Generated with Claude Code" footers or session links in pull
  request descriptions or comments.
