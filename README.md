# FillCraft

<img src="icons/icon128.png" alt="FillCraft logo" width="96" align="right" />

A Chrome extension that fills web forms instantly with **realistic US data** (incl. US Healthcare standards), **invalid data**, or **edge-case strings** — for **developers, QA engineers and anyone who builds or tests forms**.

## Features

- **3 fill modes**:
  - **Valid US Data** (incl. US Healthcare standards) — realistic names, Mailinator emails, fictional phones, real city/state/ZIP/area-code combos, DOB with matching age, SSN-format, test credit cards, **NPI (Luhn-valid), MRN, Member/Group/Policy IDs, DEA, tax ID (EIN format), license number, provider type, ICD-10, CPT, insurance carriers, plan types, coverage effective/termination dates, appointment date/time/type/status/location, medications, allergies, blood type, vitals (BP, HR, temp, SpO2, height/weight), race/ethnicity, marital status, language, emergency contact**.
    - Dates are consistent: coverage started 1–11 months ago and runs a year (active today); appointments are a weekday 1–30 days ahead in clinic hours; visits are in the last 30 days; an unrecognised date field gets today (never a guessed DOB). Text date fields follow their placeholder (`MM/DD/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `MM/DD/YY`…).
  - **Invalid Data** — bad emails, future DOBs, letters in phone fields, out-of-range numbers, length violations, coverage that expired / hasn't started, past appointments. *Random mix* gives **every** field a violation, drawn independently per field; the other choices apply one kind of violation to the fields where it makes sense (e.g. *Out of range* changes dates and numbers, not names). Where the browser physically can't hold a malformed value (a number or date picker), an out-of-range one is used instead.
  - **Edge Cases** — XSS payloads, SQL injection strings, very long strings (5000 chars), unicode, leading/trailing spaces, spaces-only, zero / oldest dates (every date field gets 01/01/1900, times 00:00). Applied to recognised *and* unrecognised fields.
  - **Boundary testing from each field's own limits** (Edge case type → *Each field's own limits*): at minimum, below minimum (min − 1), at maximum, above maximum (max + 1) — using `minlength`/`maxlength`, `min`/`max`/`step` on numbers, dates and times. Values are shaped like the field (digits for phone/ZIP, `aaa…@example.com` for email). Fields that declare no length limit are tested at **255 / 256** characters (a common database column size); where a limit can't be known (e.g. a date with no `min`), the field is skipped and the log says why.
- **Smart field detection** via `name`, `id`, `placeholder`, `<label>` (including the nearest visual label when it isn't linked), `aria-label`, `autocomplete`, and `data-testid`. camelCase and snake_case names (`patientDob`, `home_zip`) are understood.
- **Label-column layouts** (a plain `<div>Gender</div>` beside the field, common in Bootstrap apps) are understood too.
- **Date pickers**: a text date box follows the format of the date already in it (e.g. `29 Sep 2026` → `17 Apr 1985`); a date of birth pre-filled with today’s date counts as empty. **Clear** leaves date-picker boxes as they are (emptying one crashes some apps) and says so.
- **Checkbox groups** (e.g. Hobbies) always get at least one tick in Valid mode.
- **Never touched**: code-editor boxes (CodeMirror, Monaco, Ace…), the search box inside library dropdowns, and **action menus** (⋮ / account menus — ARIA `menu`): only real listbox-style dropdowns are ever opened.
- **Honest results**: if a page throws a value away (a date picker reverting, a mask clearing it), the field is reported as failed, not filled.
- **Required fields** are detected from `required` / `aria-required`, a `*` or "(required)" on the label, or a wrapper classed `required` — used by *Only fill required fields* and marked in Detect.
- **Handles** text, email, tel, number (respects `min`/`max`/`step`), date/month/datetime/time, URL, password, textarea, native `<select>` (single and multiple), radio groups, checkboxes (including custom-styled ones whose real input is hidden).
- **Dropdown & radio choice** setting: match the generated data (default), first option, last option, or random option — never a "Select…" placeholder.
- **Retries**: if a page rejects or clears a typed value (input masks), FillCraft types it key by key instead.
- The search box inside a library dropdown (React-Select, MUI Autocomplete, Ant, Select2) is never typed into as plain text — typing there doesn’t select anything.
- **Custom dropdowns (on by default)** — Angular Material `mat-select`, MUI Select / Autocomplete, React-Select, Ant Design and ARIA comboboxes, including multi-selects and dependent dropdowns (e.g. City, enabled once State is picked). FillCraft clicks the dropdown open, picks the option, confirms it was selected, and closes the list the way a user would (clicking outside it). Action menus (⋮, account menus) are never opened. Turn it off in Settings if a page misbehaves.
- **Visible label first** — a field is recognised by the label you see ("City"), not by an internal name like `addressCity` that would make it look like an address.
- **Time zones** match the patient's city (e.g. Phoenix → "Arizona", Denver → "Mountain Time") in any common list style (`America/Denver`, `US/Mountain`, "(GMT-07:00) Mountain Time", "MST").
- **Execution log** — after a fill, the popup lists every field with ✓ filled / – skipped / ✕ failed, what it was recognised as, the value entered, or the reason it was skipped or failed. Filter by status; **click a row to scroll to and highlight that field** (also inside iframes). Results of a keyboard-shortcut run are shown the next time you open the popup.
- **Phone-aware**: split phone fields (area / exchange / number) are filled segment by segment; phone-input libraries (react-phone-input-2, intl-tel-input, …) get the digits typed one by one; otherwise the format follows the field's placeholder, defaulting to `XXX-XXX-XXXX`.
- **Dropdown-aware**: tries multiple hints per field — e.g. a state dropdown is matched by both code (`NY`) and full name (`New York`). Matching is whole-word, so `Male` never selects `Female`.
- **Framework compatible** — uses native setters, dispatches `input`/`change` and a real blur so React/Vue/Angular state and "touched" validation update.
- **Works inside iframes** — every frame of the tab is filled.
- **Keyboard shortcuts** (change them at `chrome://extensions/shortcuts`; the popup shows your current ones). The number of fields filled appears on the toolbar icon.
  - `Alt+Shift+V` — fill with valid data
  - `Alt+Shift+M` — fill with invalid data (Chrome does not give extensions `Alt+Shift+N`)
  - `Alt+Shift+E` — fill with edge-case data
  - `Alt+Shift+L` — clear all fields
- **Modern popup** that follows your system light/dark theme: four mode cards (they condense to one row while results are shown, so everything fits Chrome’s 600px popup), a live status with progress, the per-field results list, and separate **Settings** (toggle switches, dropdown-choice selector, test-data types) and **Help** views. Any non-default setting is shown under the cards so it never surprises you. Keyboard: Tab/Enter work everywhere; Esc returns from Settings/Help.
- **Detect form fields** lists each field, what it was recognised as, and whether it is required, using the current options.
- **Never submits** a form — it only fills.

## Install (developer mode)

1. Get the code: on GitHub click **Code → Download ZIP** and unzip it (or `git clone` the repository).
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `FillCraft` folder (the one that holds `manifest.json`).
6. Pin the extension to your toolbar for quick access.

To update: download the new version into the same folder (or `git pull`), then click ↻ on FillCraft in `chrome://extensions`.

The `"key"` in `manifest.json` fixes FillCraft's extension ID (`cdccebepcdokpoenfjphjggbokolgjco`), so renaming or moving the folder keeps your settings, saved test files and shortcuts. (Without it the browser derives the ID from the folder's path.) Adding the key changed the ID once, in 1.15.4.

## Use

1. Open the page with the form you want to test.
2. Click the extension icon (or press a shortcut).
3. Pick a fill mode. The form fills instantly with appropriate data.
4. Use **Detect form fields** to preview what will be recognised before filling.
5. Or right-click a field → **FillCraft** to fill just that field or its section, or to tell FillCraft what the field is.

## What's new

Latest: **1.20.0** — right-click a field. The full history of every version is in [CHANGELOG.md](CHANGELOG.md).

## Safe-by-default test data

- Phone numbers use the **555-01XX** exchange range reserved for fictional use (e.g. `212-555-0142`), on a real area code that matches the generated city — so they pass phone-format validators but never reach a real person.
- Emails use **Mailinator** in the form `firstname.lastname.NNNN@mailinator.com` so the address aligns with the generated patient name and is **easy to verify** in test flows. Open the public inbox at `https://www.mailinator.com/v4/public/inboxes.jsp?to=<local-part>` to read confirmation / verification emails the app sends. (Mailinator inboxes are public — never use them for anything sensitive.)
- The "confirm email" / "verify email" field is filled with the **same** address as the primary email, so re-typed-email validation passes.
- SSNs use the `9XX` prefix (never issued as SSNs).
- Credit cards are publicly published gateway test PANs (Visa `4111…`, MC `5555…`, etc.).
- **NPI** is a random 10-digit number starting with 1 or 2 (as CMS issues them) with a valid Luhn check on the 80840 prefix — passes structure validation.
- **DEA** uses a synthetic 2-letter + 7-digit format with the proper check digit; the second letter is the provider’s last-name initial.
- **ICD-10 / CPT** codes are real, widely-used codes for routine encounters (e.g., `Z00.00` general exam, `99213` office visit); preventive-visit CPT codes match the patient’s age band.

## Permissions

- `scripting`, `activeTab` — inject the filler into the page when you click a mode or press a shortcut.
- `storage`, `unlimitedStorage` — remember your options and the test files you saved on the Test files page (images / PDFs up to 2 MB each).
- `contextMenus` — FillCraft's entries in the right-click menu.
- `<all_urls>` host access — needed to fill forms inside **cross-origin iframes** (embedded payment/intake forms); `activeTab` alone only covers the tab's own origin. It also lets the small right-click listener (`ctxmenu.js`) run on every page: it only remembers which element you right-clicked last — it fills nothing, sends nothing and changes nothing. Filling only ever happens when you trigger it.
- FillCraft never submits, saves or closes a form, and sends nothing anywhere: it has no server, and all its data is generated on your computer.

## Files

- `manifest.json` — extension config (Manifest V3)
- `popup.html` / `popup.css` / `popup.js` — toolbar popup UI
- `runner.js` — shared injection + result aggregation (used by the popup and the service worker)
- `data.js` — US datasets and the valid/invalid/edge generators
- `content.js` — field detection + form-fill engine (injected on demand)
- `background.js` — service worker (handles keyboard shortcuts and the right-click menu)
- `menu.js` — the right-click menu; `ctxmenu.js` — remembers which element was right-clicked; `fieldrules.js` — the per-site field settings made from that menu
- `guard-main.js` — the page-side half of "never submit": stops `form.submit()` only while FillCraft is filling
- `options.html` / `options.css` / `options.js` — the Test files page; `popup-select.js` — the Settings dropdowns
- `fieldsettings.html` / `fieldsettings.css` / `fieldsettings.js` — the Field settings page
- `samples/` — the built-in test files for upload fields (cards, ID, signature, PDFs): all drawn for testing and marked "not real"
- `icons/logo.svg` — the logo (an “F” built from form fields, with a typing cursor and an auto-fill sparkle)
- `icons/icon16/32/48/128.png` — the PNG icons Chrome uses

## Tips

- If FillCraft recognises a field wrongly, right-click it → FillCraft → **Treat this field as…**. If the page doesn't react to a filled value, your framework may be using a non-standard input: please open an issue.
- `Only fill required fields` is great for testing minimum-required-data flows.
- Browsers block extensions on `chrome://` pages and the Chrome Web Store. For local `file://` pages, enable **Allow access to file URLs** for FillCraft in `chrome://extensions`.
- After reloading the extension, just click a mode again — the latest code is injected automatically.

## License

Released under the MIT License — see [LICENSE](LICENSE).
