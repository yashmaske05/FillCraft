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

## What's new in 1.7.0

- **Multi-pass fill** (up to 3 passes): fields that appear or become enabled after an earlier choice — a dependent State after Country, a conditional "please specify" box — are filled in a later pass.
- **Non-standard radio groups**: `role="radio"` groups and toggle-button groups (Angular Material button toggles, MUI toggle buttons) are recognised and filled. Toolbars, menubars and tablists are never touched.
- **Copy report** button in the results: copies a troubleshooting report — date, browser, action run, page origin + path, settings, status, and per field: status | label | recognised as | reason | element signature. It **never includes field values**, so no test PHI leaves via the report.
- **Server-search autocompletes**: FillCraft types a search seed into the dropdown's search box, waits for loading to finish (watching only that dropdown), then picks the matching suggestion.
- **Long / virtualized lists**: if the wanted option isn't drawn yet, FillCraft searches the list or scrolls it to find it.
- **Navigation guard**: if picking an option changes the page address, the fill stops and the popup says which field did it.
- Tested with Ant Design (v6), Select2, Choices.js, React-Select, MUI and Angular Material.
- **Collapsed sections** (accordions, <details>) are opened so their fields get filled; turn off with the "Open collapsed sections" setting. Dropdowns, menus and tabs are never opened by this.
- **Checkbox dropdowns**: multi-select lists whose options carry a checkbox (MUI Autocomplete / popover lists) are filled by clicking the option text, the way a person would.
- **Masked phone fields** are checked after filling: if a mask shifted the digits, FillCraft re-enters the number in the mask's format, or leaves the field empty and reports it — never a wrong number.
- **Copy dropdown details** button in the results: opens each dropdown that is still empty, records how its list is built (tags, classes, roles and up to three short option texts — no field values), closes it and copies that, so a dropdown FillCraft cannot fill can be diagnosed without DevTools.
- **More field types**: Check-in / Admission Date, Referral Date (before check-in), Phonetic Name, Referred by (a provider name), and any box with a date placeholder (MM/DD/YYYY) gets a date. A lone "Height (in)" gets the whole height in inches (e.g. 64); next to a feet box it gets the inches part.
- **Country, State and Time Zone are never picked at random**: if the matching value is not in the list (after searching the list, including a search box inside the popup), the field is reported as not found instead of getting a value that contradicts the address.
- **Phone widgets are checked**: the number that lands must be exactly the generated one (optionally after +1); otherwise FillCraft retries a different way and, failing that, empties the field and reports it — never a wrong number.
- **Notes and comments** get generic US clinical notes of **at least 100 words** (built from shuffled clinical sentences — no names, nothing about the tool). A maxlength cuts them at a sentence end; page rules like "at least 150 words", "maximum 300 characters" or "no more than 50 words" are met by adding or removing whole sentences.
- **Check and fix (1.8.0)**: after each round of filling, FillCraft reads the error the page shows next to each field it filled (MUI, Angular Material, Ant, Bootstrap, plain HTML and the browser's own checks). With **Valid** data it enters a value that follows the page's rule — "between 0 and 99" → a number in range, "max 5 characters", "only letters", date limits, the field's own min/max/maxlength/pattern — and marks the field "Adjusted"; if nothing satisfies the page, the field is emptied and reported with the page's own words. With **Invalid / Edge** data nothing is changed: the page's message is recorded next to the field. Errors that only appear after pressing Save cannot be seen (FillCraft never submits).
- Labels like "No. of…", "Number of…", "How many…" get a small whole number.
- A label that **ends in a format word** gets that format: "Pharmacy Phone" / "PCP Phone" → a phone number, "Pharmacy Email" → an email, "… ZIP" → a ZIP, "… Date" → a date. Check-in / admission dates use today (pickers often refuse past or future check-ins).
- **Fields the page clears later are filled again**: when a later choice resets part of the form (e.g. "Relationship to insured" clearing the subscriber section), those fields are refilled once at the end and marked "Filled again"; if the page keeps them empty, they are reported.


## What's new in 1.20.0 — right-click a field

Right-click any field → **FillCraft**:

- **Fill this field ▸ Valid / Invalid / Edge** — only that field, even if it already holds a value.
- **Fill this section ▸ Valid / Invalid / Edge** — only the block around it (a titled block such as "Demographics", a fieldset, a card); nothing outside it, no other sections or tabs opened.
- **Treat this field as ▸ Person / Contact / Address / Insurance / Clinical / Provider / Dates / Other ▸ …** — for a field FillCraft gets wrong ("Ref. Phys." → Provider name, a box that needs your test provider's Medicare ID…). The field is filled at once, and from then on every fill on that **website** fills it that way.
- **Leave this field alone** — never filled on that website (filling it with *Fill this field* still works when you ask).
- **Forget my setting for this field**, and **Field settings…** — a page that lists every setting by site, where you can change a type, remove one or all, and **export / import** them for the team (the file holds site addresses and field labels — never values).

The toolbar icon shows ✓ when it is done (! when not, e.g. no field where you right-clicked); pointing at it says what happened. A fill started from the menu shows its results when you open the popup. In the results, fields filled or left alone by your setting carry a **Your setting** tag; the popup also says how many settings the site in the tab has.

How a setting recognises the field next time: its own label, name, test id and id — but not ids that libraries make up anew on each load (Mantine's `mantine-r3k`, React's `:r5:`…). A setting that fits two fields on one page is not used, and the results say so. Nothing changes for a site without settings.

Chrome draws the right-click menu (its look follows Chrome and Windows). To know which field was right-clicked, FillCraft now has a tiny listener on pages that only remembers the last right-clicked element — it fills, reads and sends nothing.

## What's new in 1.19.1 — faster, with nothing left out

Measured on the test bench (12 pages, 2 fills each): **106.5 s → 77.6 s in total (−27 %)**; Mantine 6 forms and Select2 forms **about 2.5× faster** (5.9 s → 2.4 s, 5.6 s → 2.2 s for 9 dropdowns); most other library forms about 0.5 s faster each; the whole release check of all libraries in Valid / Invalid / Edge 917 s → 648 s. Every page fills exactly the same fields as before (regression against 1.19.0: no differences). A dropdown whose list does not hold the patient's value still takes up to 2 s per search word longer — that wait is kept on purpose (see below).

- **Dropdowns of one kind open the way the last one did.** To open a dropdown FillCraft tries the field's click targets in turn; Mantine 6 and Select2 ignore a click on their outer box, so every dropdown first lost 400 ms on it. The target that worked is now tried first for the next dropdown of the same kind (the usual order follows if it does not open it).
- **The checks at the end wait for the page only as long as still needed.** They let the page react to the last change (emptying a field it resets, validating after a short delay) — the same 300 ms / 250 ms after the last change as before, no longer added on top when that time has already passed.
- A previous list's closing is looked at every 25 ms instead of 60 ms (same limit).
- Not shortened, on purpose: the waits for a server search to answer, for fields a choice reveals, for a State list after a Country, and for search suggestions — shortening those could leave fields empty.

## What's new in 1.19.0 — choose the test patient, and keep the same one

Settings → **Test patient** (the defaults — Adult, Any insurance, Any state, same person off — make exactly the person FillCraft made before):

- **Patient: Any / Child / Adult / Senior 65+.** A **child** (2–17) has a parent who is the emergency contact and guardian — and, on a private plan, the subscriber ("Relationship to insured: Child"); a child's height, weight, heart rate, breathing rate and blood pressure; children's diagnoses (well-child visit Z00.129, ear infection, sore throat, eczema…), medicines (children's doses), vaccines for the age, a pediatrician, and the well-child visit code for the age (99382–99384 / 99392–99394). Occupation "Student", no employer or title. A **senior** (65–90) is retired; vaccines for 65+; on Medicare the preventive visit is the Annual Wellness Visit (G0438 / G0439).
- **Insurance: Any / Private / Medicare / Medicaid / No insurance.** **Medicare** (offered with Any / Senior only — it is for 65+) is Original Medicare or a Medicare Advantage plan, with a valid **Medicare ID (MBI)**; on Original Medicare it is also the member ID, and there is no pharmacy BIN. **Medicaid** comes with a state Medicaid ID. **No insurance** is a self-pay patient: the insurance boxes are left empty on purpose (and say so in the results), a carrier list gets "Self Pay" / "Uninsured", an insurance-type list "Self-Pay".
- **State:** addresses (city, ZIP, area code, county, time zone) in one of the states FillCraft has cities for.
- **Keep the same person:** every fill — Valid, Invalid and Edge, from the popup or a shortcut — uses one patient until you press **New person**, change the Test patient settings, or close the browser. For forms with several pages. The popup shows who it is; the results and Copy report name the patient only by a short number (#KGCF).
- Fields labelled "Medicare ID / MBI" and "Medicaid ID" get the patient's own ID (the same on every page).
- **Insurance-type lists that sort by kind** ("Commercial / Medicare / Medicaid / Self-Pay" rather than "HMO / PPO") now get the right kind — they used to get a random one.
- **An insured patient never gets "None" / "Self Pay" by chance:** when a list lacks the patient's own value (their carrier is not listed), any other option is chosen — but not one that says they have none. (The "Random" dropdown setting stays fully random.)

## What's new in 1.18.0 — no more "Test input", and a full clean-up

- **Fields FillCraft has no type for get a value that fits what they ask**, read from their label, name and placeholder — never "Test input" again. Examples: Claim Number → `CLM-30258768`, Prior Authorization Number → `AUTH662525`, Medicare ID / MBI → a Medicare Beneficiary Identifier in the CMS format, Days Supply → `29`, Duration (minutes) → `15`, Lab Name → a lab, Room → `Room 196`, Reaction → `Hives`, Barriers to Care → `Work schedule`, "Is the patient homebound?" → `No`. A placeholder example (`e.g. AB-1234-X`, `SN-000000`) is copied in shape. Every value respects the box's maxlength, minlength and pattern. Only a box with no usable words at all gets `Sample <its name>`.
- **Phones are different numbers**: Primary, Secondary / Alternate, Home and Work phone each get their own number.
- **Better recognition** of labels with punctuation or marks ("Pharmacy Phone:", "Name *", "(required)"), Relationship to Insured / Policy Holder, Cardholder ID, emergency-contact mobile, Exp. Month / Exp. Year, Credit Card Type (not the card number), "Full time / Part time" (not a time), "Is your tetanus shot up to date?" (not a date), web address (not a street address), and more. **Subscriber / Insured / Policy Holder First and Last Name** get the subscriber's name (the spouse or parent when the patient is not the subscriber), not the patient's.
- **Data that agrees with itself**: Medicare and Medicaid patients are always their own subscriber; no MD / DO under 27; no parent as emergency contact for a patient of 60+; a nurse practitioner's taxonomy code follows the specialty; the Rx BIN is the carrier's own where it is published (Aetna, Humana Part D, UnitedHealthcare / OptumRx); plan names never start with "Select" (that looked like an empty dropdown).
- **Widgets**: a transfer list whose page draws the moved items a moment later is no longer reported as "nothing to move"; a toggle button that is already the right one is no longer clicked off; radios the page re-draws when one is chosen are reported as filled; sliders with a step (5, 0.1), a negative range, or that move only by clicking their track land on the intended value; an upload with `accept="image/jpg"` gets the sample JPG; a read-only box with a class like "validate" is no longer taken for a calendar; a repeated row (2nd medication) the page empties gets its own value again, not the next row's; read-only calendars in Invalid mode use the same dates as date boxes.
- **Counts add up**: a field the page emptied and also flagged is counted once.
- **Stops when it should**: after the page goes elsewhere, no more choice buttons, widgets or uploads are filled; Stop is honoured between page-error fixes.
- **Clear**: sliders and colour pickers (which cannot be empty) are no longer reported as "could not be cleared"; "Go to / Sort by / Switch patient" dropdowns are left alone, as a fill does.
- **One run at a time**: starting a fill or clear while one is running on the page says so (instead of losing track of the running one); a long fill (over 5 minutes) or one still working inside an iframe still shows Stop; a form in an iframe that stopped with an error is mentioned in the result instead of being dropped. Copy dropdown details now also has the page's submit guard. A page that does not answer says "not responding" instead of "can't be accessed".
- **Popup**: the report records the settings the fill started with; keyboard focus returns to "Copy dropdown details"; focus rings show in Windows high-contrast mode; the help text says what is really never touched (drawn signature pads — a typed signature box gets the person's name).

## What's new in 1.17.1 — truthful results for fields the page empties

- **A field the page empties again is reported as failed, not "filled".** Some pages clear a value a moment after it is entered (an SSN box on one patient form); FillCraft filled it again and reported "Filled again" even when the page then cleared it once more. At the end of a fill every text field is checked again: an empty one is "failed — the page emptied this field again", and Copy report shows what the box asks for (its length limits, pattern, placeholder length, and how long the entered value was — never the value).
- **SSN in the form the box wants**: a box that shows or allows 9 characters without dashes ("XXXXXXXXX", maxlength 9) gets the 9 digits; a box the page emptied is filled again in the other form (digits ↔ dashes). (FillCraft's SSNs start with 9 — never issued to a real person; a page that applies the SSA's rules may refuse those in any form, and the report now says so.)
- **Lists left open**: a list still open after the usual steps is closed the way a person does it — into its box, then away (a Mantine list closes only then). Copy report names the field whose list stayed open and each step tried, and, for a dropdown that failed, which fields' lists were already open (by their row number).

## What's new in 1.17.0 — tested against the common dropdown libraries

FillCraft is now checked before each release on a test bench of real UI libraries — Mantine 6 and 7, MUI, React-Select, Ant Design, Headless UI, Radix (shadcn/ui), Select2, Tom Select, Choices.js and PrimeReact — each in the setups that broke it on real apps (list inside or outside the dialog, both React render modes, rows without roles, searchable, virtual lists). The bench is a separate tool, not part of the extension. It found these, now fixed:

- **A field never takes a value from another field's list.** A dropdown's own list is recognised also when it is drawn inside the field, and a list that belongs to another field (drawn inside it, or pointed at by it) is never picked from. A list FillCraft opened earlier that is open again is closed before the next dropdown opens.
- **Tom Select**: values landed in other fields (State changed while Language was filled). The page re-focuses a dropdown on a timer after a pick; FillCraft now lets it finish (a 40 ms pause, shorter than a person's) before moving on.
- **Ant Design** (lists that draw only ~10 rows and scroll with their own scroll bar): Country / State were picked at random instead of United States and the address's state; the list is now scrolled to find them. With the list drawn next to the field, the results showed the whole list as the value.
- **State searches**: a search for the state typed "TX" twice and never "Texas" (lists that search names found nothing — Texas, Arizona, Pennsylvania…). Each value is searched once.
- **Radix / shadcn Select** (list laid over the field): its first option was not picked — Radix ignores the first release over the field it opened from. A row that did not take is clicked once more (only a plain, still-unchosen row in a single-choice list).
- **Mantine 7**: the icon area beside each Select was taken for a dropdown of its own — and clicking it hit the clear "×", which emptied the value just picked. FillCraft never clicks a clear / remove / reset button while opening a list.
- **PrimeReact**: dropdowns were not tied to their labels (named "Select…", so Country was picked at random); its hidden helper input and select no longer count as separate fields.
- **Choices.js without a search box**: no dropdown was found (the field calls itself a listbox).
- **Invalid / Edge data never type test strings into an app's search** ("<scr", "' OR '1'='1"): a dropdown's own options are found with common letters.
- **Copy report** now includes, for each dropdown that failed, what it saw and did at that moment (how it opened, which list it took as its own, how many options, what it clicked, whether the field showed it) — page structure only, never page text or values. One report is enough to diagnose a new app.

## What's new in 1.16.2 — dropdowns that pick on mouse-down (a Mantine Add Patient form)

- **Clicks happen in a real mouse's order**: press, then focus (only when the page allows it), then release and click. FillCraft focused first and pressed after: a Mantine dropdown opened on the focus and closed again on the press, and a list option lost its list before it was picked. On a real Add Patient form every dropdown failed or took a value from the previous dropdown's list (State = the whole country list, Language = a provider's name, Program = the POS list).
- **The row under the mouse is not the chosen one**: Mantine marks it aria-selected; only data-selected counts as chosen there. FillCraft took a hovered row for a pick and moved on.
- **Lists drawn without option roles or classes**: the list's own wrapper ("…itemsWrapper") is read as its rows, never as one option whose text runs the whole list together.

## What's new in 1.16.1 — Mantine forms (an Add Patient form)

- **`autocomplete="one-time-code"` used to block autofill**: some apps put it on every box to keep the browser's autofill away. FillCraft skipped all of them as verification codes (First Name, SSN, phones, address, every dropdown). Now a box counts as a code only when nothing else names it: a dropdown / calendar / email box, a known label, or a form where two or more such boxes are plainly other fields is filled. Real code boxes (a lone code box, "Code", "We sent a code to your phone", rows of digit boxes) are still left alone.
- **Mantine dropdowns**: the Select's search box is no longer typed into as a text field (each one was listed twice, once as "The page cleared the value"); it is filled as a dropdown only. A list's wrapper is never taken for one option (its text ran all options together: "Dr. David Clark, DODr. Mary S…", "ComplexLowModerate"); the list a Mantine Select opened is recognised as its own, so another field's list is never picked from.
- **"+ Create …" / 'Add "…"' rows are never picked**: in a list that adds what was typed as a new entry (Referring Provider), an existing entry is chosen instead.
- **A typed search is not a choice**: a dropdown's search box shows what FillCraft typed whether or not anything was chosen; after typing, the choice must still show once the list is closed, else the field is reported.
- **Mantine calendars**: read-only date boxes that open a Mantine calendar (Date of Enrollment) and Mantine's date pickers (buttons) are filled; days of the months around are never clicked; dates a year or more away are reached through the calendar's header (month → year → decade), so Invalid data's 01/01/2000 works. The calendar is closed afterwards with a click beside the form (never Escape, which would close the drawer).
- **A field's error / help text** ("Select a program" under a Mantine Select) is no longer mistaken for a dropdown (it showed up in Copy dropdown details as an unlabelled dropdown that did not open).
- Read-only date fields are named without their "*".

## What's new in 1.16.0 — easier to read and to use by keyboard

- **Keyboard**: the mode cards, Detect fields and the selected results filter show a focus ring when reached with Tab (they showed none). Nothing changes for mouse clicks.
- **Results list**: the full reason a field failed or was skipped is shown (up to 3 lines, it was cut at one); rows are a little more compact; fields not matched to a known type say **Other** (with an explanation when pointed at) instead of "Unrecognised", which read like an error on fields that filled fine.
- **Field names**: a label that is only "*" no longer gives "(unnamed div)" — the next candidate is used, and a field that really has no name says so ("Dropdown with no label"); uploads are named by their own words ("Profile Picture Upload", "Insurance Card — Upload Front Side") instead of a whole form row or "Click here to … Drag and Drop Your File or Browse"; a text editor's own aria-label wins over the text of the controls next to it (it was named after a row of choice buttons, and its text was chosen from that name).
- **Readability**: no text is smaller than 11 px (shortcut pills were 9.5 px); Copy report, Copy dropdown details and Manage test files… are at least 24 px tall.
- **Settings → Edge cases**: a **Payloads / Field limits** switch above the list, which shows only that kind (the limits were hidden below the list's scroll). The setting and its saved value are unchanged. A changed setting's dot says "Changed from the default" when pointed at.
- **Help**: the same tips in four groups that open and close, and the version in the Help header.
- US spelling in the popup and Test files page (Behavior, recognized, license).

## What's new in 1.15.10 — Invalid / Edge data do what they say

- **Custom dropdowns with Invalid / Edge data**: a dropdown cannot hold invalid text, so it now gets one of its own options. State dropdowns (e.g. the three on one patient form) failed with "Couldn't find "x" in the list" in Invalid "Random mix" and every Edge payload — the list was even searched for the test string first.
- **Too short / too long**: a too-long value is never cut back to the field's maxlength any more (6 of 8 fills of a 300-character notes box used to end up within the limit).
- **Each field's own limits** on sliders / spin buttons: "At minimum" sets the minimum (it set the maximum); "Below minimum" / "Above maximum" are reported as not possible. On rich-text editors they use 1 / 255 / 256 characters like other text fields (they got a random payload).
- **Random mix**: each unrecognised field gets its own value (all of them got the same one).
- **Spaces are visible**: values with spaces around them show them as ␣ in the results list; email / URL boxes, which drop such spaces (a browser rule), say so — and "Just spaces" there is reported as such, not as a failure. "Just spaces" in a rich-text editor is no longer reported as failed.
- **At minimum** on an email box without a declared minimum uses the shortest real address (`a@b.co`), not "A".
- **Very long string** in an address search box that finds nothing took over two minutes (the 5,000-letter value was typed key by key as a search); the search now uses at most its first 12 characters.

## What's new in 1.15.9 — Stop

- **Stop a running fill**: while a fill runs, the popup shows **Stop** next to "Filling with…" (also when you reopen the popup during a fill started earlier, e.g. by a shortcut). FillCraft finishes the field it is working on — a slow searchable dropdown, list search, address lookup or calendar is cut short too — closes any list it opened, and reports "Stopped by you — filled N fields" with the usual results list. What was filled stays (use **Clear form** to empty it); nothing is submitted. A Stop never affects a fill started after it.

## What's new in 1.15.8

- **Test files page redesigned**: upload types are grouped (insurance, Medicare, Medicaid and photo-ID cards with front and back side by side; photos; documents & signature) as cards with a large preview; a summary says how many use your own files; the page matches the popup's look, including dark mode. What the page does is unchanged.

## What's new in 1.15.7

- **Settings and Help**: the back button and title stay at the top of the popup while you scroll.

## What's new in 1.15.6 — dropdowns the page resets

- An Add Patient form: choosing "Relationship to Insured" resets the Subscriber section. Its text boxes were filled again, but its **State and Country** dropdowns stayed empty while the log said "filled". Now dropdowns the page empties after they were filled are chosen again too (Country before State, then the text boxes), marked "Filled again — the page had emptied it"; one the page keeps emptying is reported as failed, not filled.

## What's new in 1.15.5 — fixes from a full review

- **Right values in healthcare fields**: "Insurance / Medicare / Medicaid / Health plan Card Number" gets the member ID (it got a test credit-card number); "Pulse Ox" / "Pulse Oximetry" gets the oxygen saturation (it got the heart rate); "Discharge Disposition" is no longer taken for a job title; "Pain / Wound / Injury Location" is no longer given a clinic name.
- **Address search boxes that find nothing** keep the typed address (they were left holding the last search letter, "1").
- **Invalid / Edge data** leave record-changing boxes ("Patient is deceased", "Delete", "Do not resuscitate") unticked, as Valid data always did.
- **Edit forms**: a saved "None" / "N/A" in a dropdown counts as filled, so "Skip already-filled fields" keeps it. (In an empty form it is still the list's default and gets filled.)
- **Clear** says how many custom fields it left as they are (dropdowns, text editors, sliders…) instead of reporting only what it cleared.
- **Settings** saved by versions before the "Custom dropdowns on" change keep their Invalid / Edge choices.
- **Keyboard shortcut** for invalid data is now `Alt+Shift+M`: Chrome never assigns `Alt+Shift+N` to extensions, so that shortcut did not exist. Set another one at `chrome://extensions/shortcuts` if you prefer.

## What's new in 1.15.4 — checkbox lists that reload, and "All"

- An Add Staff User form's "Location" (same checkbox list as Specialities): FillCraft picked "All" and the pick did not stick. Fixed:
  - "All" / "Select all" is never the value FillCraft picks while real choices are listed.
  - The checkbox is ticked where a pointer really lands: the see-through `<input>` itself (MUI draws the box around it; the box alone does not react). 1.15.3 clicked the box first and only then the input — and a list that reloads every moment (it is fetched again and again from the server) had already drawn new rows by then.
  - The row is looked up again, by its text, right before each click and when checking whether the pick took.
  - If the first try fails, the fallback searches the list's own rows (also for lists without recognisable markup) and never clicks the dropdown box of a list that is still open (that closed it, or undid the pick).
- "Copy dropdown details" waits up to 3 s for a list that loads from the server, so it records the list, not just the swapped arrow icon.
- Tested on a rebuild of that list (loaded from a slow "server", an "All" row, rows redrawn every 0.5 s) and on the earlier rebuilds; please confirm on the real form.

## What's new in 1.15.3 — checkbox lists where only the checkbox reacts

- Found with "Copy dropdown details" from an Add Provider User form: in the Specialities and Insurance(s) Accepted lists each row is a box with an MUI checkbox and the option's text, and only the checkbox reacts to a click. FillCraft clicked the text, so nothing was ticked ("Picked … but the dropdown does not show it"). Now, when a click on a row's text does not tick it, FillCraft ticks that row's own checkbox — only while it is still unticked, so a list where the whole row reacts is never ticked twice. A row counts as chosen when its own checkbox is ticked (never a list's "Select all" box).
- "Copy dropdown details" now records the whole opened list and one complete row (its checkbox and text), not the dropdown's swapped arrow icon.
- Tested on a rebuild of that exact structure (and the earlier variants); please confirm on the real form.

## What's new in 1.15.2 — dropdowns known only by what they show

- 1.15.1 still missed multi-select dropdowns built without any library markup: a plain box that says "Select Option from Dropdown" (or "Select", "Choose…") and ends in an arrow, with no ARIA role, no "select"/"dropdown" class and no pointer cursor, whose list is drawn right under it. FillCraft now recognises such a box when it is in a form or dialog and has a label (toolbar "Select ▾" menus, "Select file" / "Choose photo" areas and date boxes are left alone).
- The rows of a list that just opened are recognised by what they show when their markup is unknown: rows with their own checkbox (or radio), or a run of look-alike rows. Such a list is waited for while it loads, and closed afterwards like any other.
- Labels: a field with no label of its own no longer takes the previous field's name from MUI's outlined border (MUI repeats a field's name there as a `<legend>`).
- Tested on four ways of building such a dropdown (MUI Select with a search box, an in-house box with checkbox-label rows, one with clickable rows and a drawn checkbox that loads slowly, and a button opening a searchable list) — not on the real app's page, whose markup was not available.

## What's new in 1.15.1 — multi-select dropdowns with checkboxes

- **Multi-select dropdowns are filled** (e.g. "Specialities", "Insurance(s) Accepted", "Work Locations", "Languages Spoken" on an Add Provider User form). Their trigger is a read-only box saying "Select Option from Dropdown" / "Select" (or showing an arrow), and their list has a "Type to Search" box and a checkbox per row. FillCraft did not see them as dropdowns at all; now it opens them, ticks one matching choice (the person's specialty, insurer, language when listed), and closes the list. Rows drawn as MUI menu items with a checkbox, list buttons or checkbox labels all work; a ticked checkbox counts as "selected"; searching happens in the list's own search box, never in the read-only trigger.
- Provider forms: "Federal Tax ID" in a number box gets the tax ID's digits (it got "1"); "Taxonomy Number" gets a NUCC taxonomy code matching the provider type and specialty; "License Name" gets a license name (not the license number); the DEA number's second letter is the person's own last-name initial; "DEA Expiry Date" (and other "… expiry / end date" fields) gets a future date, not today; "Provider Bio" describes a clinician ("a physician assistant in Family Medicine…"), not an office job; "Specialities" and "Insurance(s) Accepted" are recognised.
- With Valid data, boxes such as "Doesn't have NPI Number" / "No middle name" stay unticked, so the field they would switch off is filled.
- Cost: a dropdown whose list has its own search box (Select2 too) is now searched before it is called empty, so an empty one takes about 3 s more.
- Tested on a replica of the form (MUI, three kinds of checkbox rows, one list loading from a slow "server"), not on the real app.

## What's new in 1.15.0 — full audit: safety, privacy and the right value in every field

Four independent audits (safety, field filling, popup, runner / Test files page) reproduced about 70 problems on real libraries and test pages; this release fixes them. Everything below was re-tested the way the extension really runs (in the browser's isolated extension world, and through the real popup).

**Never submits, saves or closes — closed gaps**
- `form.submit()` called by the page itself (it fires no submit event) is now stopped too, by a small page-side guard (`guard-main.js`) that is active only while FillCraft works.
- Forms inside shadow DOM / web components: their submit and reset are stopped (they never reached the old guard).
- Page-triggered clicks on buttons such as "Save →", "Next ›", "✓ Save", "Approve", "Publish", "Save and Continue to Next Step", a `<button>` with no type inside a form, and web-component buttons (`<sl-button>`, `<md-…-button>`) are stopped.
- A transfer list's move button is only a button between (or tied to) its two lists — a wizard's "Next ›" beside it is never clicked.
- Read-only date boxes: the date is picked in the calendar that opened for that field only — a data grid's "Approve" / "Archive" buttons can no longer be clicked.
- A disclosure button that cancels or deletes something ("Cancel appointment ▾") is not opened as a form section.
- Clicks and focus on things outside an open dialog stop at `<body>` (dialogs that close on an outside click / focus stay open). Limit: a page listener on `document` in the capture phase cannot be stopped from an extension; FillCraft notices the dialog closing and stops at once.
- A dropdown that moves the page ("Go to section", "Sort by", `onchange="this.form.submit()"`) is left alone and reported. A page that goes to another address anyway no longer leaves the popup on "Filling…": it stops within ~1–3 s and says so.
- An address change caused by anchor tabs (`#work`) or pages that keep form state in the URL is no longer taken for navigation; the original tab is selected again.
- An overlay that holds only an `<iframe>` (Thickbox-style, full-screen booking / survey widgets) counts as a dialog: the page behind is not filled.

**Only fills what a person would**
- Bot traps: more honeypot styles are skipped (zero-height / clipped wrappers, 1–2 px boxes, placed far right, behind the page, Netlify `bot-field`, "Leave this field blank"), while real fields such as `hp_member_id` ("health plan") and "Suffix (leave blank if none)" are filled again.
- CAPTCHA: FillCraft never runs inside reCAPTCHA / hCaptcha / Turnstile / Arkose / GeeTest frames, and skips "Verify you are human", "Type the characters shown", "What is 3 + 4?".
- One-time codes: "Enter the 6-digit code we sent", "SMS code", "MFA code", single-character boxes in separate wrappers are skipped; a card's "Security code" (CVV) is filled; a consent checkbox that mentions passcodes is ticked normally.
- Cookie / privacy banners' checkboxes are left alone. With Valid data, boxes that change what a record is ("Patient is deceased", "Inactive", "Do not contact", "Delete") stay unticked.
- The "tick one box of a checkbox group" step stays inside the open dialog and skips traps.

**The right value**
- Input masks (Inputmask): SSN and dates no longer end up as `9__-__-____` / `06/dd/yyyy`; a half-filled mask is never left behind. Mask templates (`(___) ___-____`) and a phone widget's lone `+1` count as empty.
- Phone widgets that show a dial code keep `+1` (typing "617…" alone was read as Australia's +61); intl-tel-input with `+1` shown now gives a valid number.
- Split fields: a 3/3/4 phone must be adjacent boxes (a "Last 4 of SSN", "Birth Year" or "CVV" box is no longer given phone digits); Month / Day / Year boxes of a date of birth get their own part.
- Date pickers: read-only calendars (flatpickr) get the field's real date (a birth date for DOB, not a day of this month); Ant Design / flatpickr / Element pickers get the format they expect, other formats are tried when one is refused, date-time pickers get date + time, and react-datepicker calendars are closed after typing.
- Times follow the box: half-hour steps and opening hours (`step`, `min`, `max`), "hh:mm aa" (09:30 AM), "HH:MM, 24-hour" (14:30). "MM/YYYY" boxes get month / year.
- Classification: "Pharmacy / PCP / Insurance company / Facility Address" get an address (not the pharmacy / doctor / insurer name); "HR Contact Name" is a person (not a heart rate); "Nursing Unit" is not an apartment; "Reason for leaving previous employer" is a reason (not the employer); "Full Name" is the full name; nameless radio groups (Vue / React) are one group, so Gender matches the person; a date / time box whose id says "apt" is not an apartment.
- Emergency contact: its first / last name and phone are the contact's own (not the patient's), also when the page sets `autocomplete="name"` / `"tel"` or uses a phone widget.
- New realistic values: county matching the city, phone extension, years of experience (fits the age), hours per week, salary / hourly rate, supervisor / "reports to" name, initials, printed name / typed signature (the person's name), PIN (digits), a work phone different from the home phone, LinkedIn URL. Unrecognised text areas get text that matches their label ("Past surgical history", "Special instructions for delivery", "Reason for termination") instead of a clinical note.
- A State list showing its first option only because nothing was chosen ("Alabama") is filled to match the city — on a form that was empty; a saved choice on an edit form is never overwritten.
- Passwords: the length a `pattern` asks for (`.{12,}`) is honoured, and a letters-and-digits-only pattern gets `Admin1234`.
- Invalid and Edge data in date / time / number / month / week / colour boxes: an impossible-but-real value (a 2099 birth date, 03:00, 2099-W01) or the most extreme one (9999-12-31, 23:59) instead of a failure, with a note saying so. Week boxes get limit values.

**Check and fix (page error messages)**
- Help text that is always shown ("Please enter your name exactly as on your card", password rule lists) is no longer taken for an error — correct values are no longer emptied.
- Messages are followed: "Enter the date as YYYY-MM-DD", "DD/MM/YYYY format", "exactly 9 characters", "9–12 characters", "already registered / taken" (another address or user name); a phone is re-entered in the page's format before any made-up number; fading messages (Ant Design) are waited for.

**Dropdowns — three regressions from the 1.14 work fixed before release**
- Forms inside an MUI Popper / Kendo popup (non-modal) with one or more fields stay open.
- Real clinical options ("No growth found", "No malignancy found", "No known allergies found") are picked again, not taken for "list is empty".
- Lists that load their options 2–3 s after opening are filled again (1.14 skipped them). Cost: a dropdown that really is empty now takes about 3 s before FillCraft calls it empty.
- Lists whose rows are plain `<div>`s inside `role="listbox"` are seen; the end-of-fill check closes a list it could not identify if it appeared right next to the field.

**Popup, reports and the Test files page**
- Copy report: page messages, labels taken from nearby page text (e.g. a table's patient-name cell), quoted page text and record numbers in the address are left out; it states the settings the run used.
- Copy dropdown details: structure only — no page text (it could reach the whole page before).
- Reopening the popup while a fill is still running says so and waits; Clear and dropdown details never run during a fill.
- "No required fields found" when "Only required fields" is on; clearer errors for pages that failed to load and for a reloaded page; a double-click on "Reset to defaults" no longer resets; Invalid / Edge type changes count as changed settings; full reasons in each result row's tooltip; one tab stop for the result list (arrow keys move); dropdown lists in Settings stay open when their scrollbar is used; better contrast; the password box shows `Admin@1234` from the start and is saved when you leave it.
- Test files page: a file is saved with the extension of what it really is (a PNG named `.jpg` becomes `.png`); PDFs with a byte-order mark are accepted, text files posing as PDFs refused; two quick replacements both stay; nothing is overwritten when saved files cannot be read (a banner says so).
- Runner: waits no longer hang on frozen pages, a damaged saved file falls back to the built-in sample, sample files go only to frames with an upload field.

**Known limits (not fixed)**
- Clear empties every field in the form or open dialog, including values that were there before FillCraft (it skips one-time codes). It does not empty custom dropdowns (MUI, React-Select, Ant…), `role="radio"` / toggle-button groups, rich-text boxes, sliders, read-only calendar boxes or fields in other tabs — the popup says how many were left as they are.
- Some exotic widgets still need a person: lists that re-open while they fade (script-driven fades), Vuetify forms inside a `v-menu`, Vuetify 2 `v-combobox`, a Kendo combobox that refuses typed values, PrimeVue AutoComplete duplicates, lists with a stuck `aria-expanded` and no recognisable panel.
- An "Alternate emergency contact" gets the same person as the first one.

## What's new in 1.14.0 — no dropdown list is ever left open

- **Empty dropdowns** ("No matches", "No data", "No results found"): FillCraft opened them and could leave the list open over the page (an open MUI menu makes the page ignore clicks until you click somewhere). Now:
  - once a list opens — even empty, even still "Loading…" — FillCraft stops clicking it (many dropdowns open and close on the same click), and gives it time to load its options (up to 1.5 s, or 4 s while it shows a loading sign) before calling it empty;
  - it closes the list and checks that it really closed: focus moved away → the list's own "click outside" layer (only the one that belongs to that list — never a dialog's or popover's) → the dropdown's own toggle → a click on the form's background next to it. Escape is never used. A list that is still fading out after a pick is waited for, not clicked again; a dropdown's `aria-expanded` is trusted only if it was seen to change as the list opened;
  - the field is reported as **skipped — "The list is empty — it shows "No matches""** (not failed); letters typed into its search box are removed again, and a list that plainly says it is empty after one letter is not searched further (fills are 2–4× faster on such forms).
- **After every fill, any dropdown that opened during the fill and still says it is open is closed**; if one cannot be closed, the popup says so ("a dropdown list stayed open — click the page to close it"). Popups FillCraft did not open (a popover form, a hint, an inline list the page revealed) are left alone.
- **More dropdown libraries** are handled as dropdowns instead of their search box being typed into: Tom Select, Element Plus, Vuetify (also inside a Vuetify dialog), Headless UI (search box + its own list button). Free-text comboboxes (Vuetify v-combobox, Kendo ComboBox, PrimeReact AutoComplete) are still typed into. With Custom dropdowns on, the hidden `<select>` behind Select2 / Tom Select is no longer reported as a failed field; with them off it is filled by value as before, and a `required` on it counts for "Only required fields". Labels come from the right place (not the dropdown's own text or an arrow "▾").
- **Social profile fields**: Slack, X (Twitter), Facebook, Instagram, GitHub, YouTube, TikTok get a valid profile URL (or "@handle" when the field asks for a handle) — when the field is about the profile ("Slack", "X (Twitter)", "GitHub profile URL"), not when a site is just mentioned ("Slack (days)", "How did you hear about us: Facebook…"). A "valid … URL" page error gets that site's URL.
- **"About Employee" / "About the provider"** get a short professional bio, not a clinical note ("Comments about the physician" still gets comment text).
- **Settings note**: when settings differ from the defaults, one line under the mode cards says how many and names the one that leaves fields empty ("3 settings changed · Sections & tabs skipped ›", in amber); the full list is in its tooltip, each changed setting has a dot in Settings, and Settings has **Reset to defaults** (asks for a second click). The footer shield is solid green.
- **Checked by an independent review**: four reviewers and a skeptic per finding tested this change on real libraries; the 13 confirmed problems (e.g. a dialog's invisible backdrop could be clicked, dropdowns inside a Vuetify dialog were skipped, lists that load on open were called empty) were fixed and re-tested.
- Tested on real libraries loaded from their CDNs — MUI (Autocomplete, Select; on a page and in a Dialog), react-select, Ant Design, Headless UI, Select2, Choices.js, Tom Select, Element Plus, Vuetify: after each fill nothing was left open, no save / submit / close happened, normal dropdowns were filled and empty ones reported with the page's own words.

## What's new in 1.13.0 — open dialogs only; never submits or closes

- **An open dialog is the only place FillCraft works.** With a modal dialog, drawer or side panel open over the page, Fill, Clear and Detect work inside it only — fields, collapsed sections, tabs, uploads and iframes behind it are never touched. The popup says so: "Filled 12 of 12 — valid data in the open dialog "Add patient"".
  - Recognised: `<dialog>` opened with `showModal()`, `role="dialog"` / `alertdialog` / `aria-modal`, and plain overlays without any ARIA. Tested with the markup and behaviour of Bootstrap, MUI Dialog / Drawer, Ant Modal and Angular Material dialogs (copies of their structure, not the libraries themselves). Also recognised by class name, not tested: React-Modal, Chakra, Element, Vuetify, PrimeNG, Kendo, SweetAlert2.
  - A dialog counts only when it blocks the page (a backdrop covers the page around it, the page behind is `aria-hidden` / `inert`, or it fills the screen). Cookie bars, help popovers and date-picker popups do not change what is filled.
  - Stacked dialogs: the one in front. A dialog with no fields ("Discard changes?"): nothing is filled, and the popup says to close it first.
  - Iframes: only frames inside the dialog are filled (matched by address; a frame that cannot be matched for sure is left alone).
- **Never submits, saves, cancels or closes.** While FillCraft works, a form submit or reset is cancelled, and a click that is not the person's own is stopped when it would land on a Save / Submit / Cancel / Close / Next / × button, a dialog's backdrop or a link to another page — including clicks the page itself makes in reaction to a fill (e.g. "Enter saves the form"). Escape is never sent. The popup reports it: "stopped 1 page action (submit / close) — nothing was submitted or closed". Your own clicks are never affected.
  - Dropdown lists drawn outside the dialog get a plain click first (a mouse *press* outside a dialog is what "click outside to close" dialogs react to), and FillCraft's press on such a list goes no further than `<body>`.
  - If a dialog closes anyway, FillCraft stops at once and says which field caused it — it never goes on to the page behind.
  - Limit: a page script that calls `form.submit()` directly, in reaction to a value changing, cannot be stopped from an extension. No such case was seen in testing. *(Stopped since 1.15.0 — see above.)*
- **Fix:** fields scrolled out of view inside a scrolling dialog were mistaken for hidden bot traps and skipped (a long dialog scrolled down before filling lost its top fields). They are filled now; real bot traps are still skipped.
- Copy report leaves dialog titles out (a title can name a patient).
- Tested on 21 scenarios (16 with a dialog open, 5 without), each over a background form and with the page trying to close on Escape / backdrop / × / Cancel, save on Enter and submit: background untouched and nothing closed, saved or submitted in every one. The earlier suites (all field types, 300-field page, uploads 72/72 + 86/88, passwords) are unchanged.

## What's new in 1.13.0 — one known password for test accounts

- With **Valid** data every password field gets the same password, **`Admin@1234`** by default, so anyone on the team can sign in to accounts FillCraft created. Change it in **Settings → Password for test accounts**; leave it empty for a random strong password on each fill. A warning appears under the box if the password lacks 8+ characters, an uppercase letter, a lowercase letter, a digit or a symbol (it is still used).
- **When a form refuses it**, a close variant is chosen for that form only, and "Confirm password" gets the same:
  - the field's own rules (`minlength`, `maxlength`, `pattern`): `minlength="12"` → `Admin@123456`, `maxlength="8"` → `Admin@12`, a pattern forbidding "admin" → `Welcome@2468`;
  - the page's error message after filling → an adjusted password: "at least 14 characters" → `Admin@12345678`, "too common" or "cannot contain the word admin" → `Welcome@2468`, "special characters must be one of ! # $ %" → `Secure#Test2468`. The field is marked "Adjusted — page said …" and its confirm box "Matched to the adjusted password".
- The results list shows the password actually used for each form. **Copy report** still contains no values.
- Invalid / Edge data keep their own password values.
- A known password is only for **test / staging** systems — never use it on real accounts.

## What's new in 1.12.0 — which file goes into which upload

Each upload box is decided on its own, in three steps:

1. **What it is for** — read from the box's label, its button / drop-zone text, the heading before it, and (last) its name attribute. Specific kinds win over generic words: signature → Medicare (Advantage / Part D plans count as private insurance) → Medicaid → insurance card (incl. "Member ID card", dental, vision, Rx) → professional licence / certificate (a document) → photo ID (driver's licence, state ID, passport, I-9 List A/B) → consent (HIPAA acknowledgment, advance directive, POA, POLST, DNR, release of information) → clinical photo (wound, rash, x-ray) → profile photo → document. English and common Spanish wording are understood.
2. **Which side** — "front" / "back" / "front and back" / "F/B" / frente / reverso, from the box's own words first. A multi-file box that asks for both sides gets both.
3. **Which file type** — PDF when the box accepts PDF, otherwise the image version (converted to JPG / PNG / WEBP as accepted); an image over the size the page states ("Maximum file size: 30 KB") is saved smaller until it fits. Nothing is attached when no sample type is accepted (e.g. .docx, .dcm, .heic only) — the result says why.

**14 built-in samples**: profile photo, insurance card front / back, Medicare card front / back, Medicaid card front / back, photo ID front / back, medical record (PDF), consent form (PDF), document scan (image), signature (PNG), clinical photo placeholder. All fake and marked SAMPLE.

Tested on 160 realistic upload fields written independently for clinics, long-term care, insurance, HR / onboarding, telehealth and tricky wording: 158 get the expected file; the other two are deliberate (HEIC cannot be produced by a browser; a field named `drivers_license_back` gets the licence back).

## What's new in 1.10.0 — sample files for uploads

- **Attach sample files to uploads** (Settings, off by default, Valid data only): upload fields get a fitting test file — profile photo, insurance card front/back, Medicare card, Medicaid card, photo ID, a medical-record PDF and a signed consent PDF. The file is chosen from the field's label, the button / drop-zone text and the heading before it ("Medicare ID — Upload Back Picture"), and must match what the field accepts (images are converted to PNG / WEBP / JPG when needed) and any size limit stated nearby. Fields that allow several files get the record and the consent form. **Clear form** removes attached files.
- **Built-in samples** (samples/) are fake and clearly marked **SAMPLE – TEST ONLY** — synthetic data, no real people, no official logos.
- **Test files page** (Settings → Manage test files…): replace any sample with your own **test** file (JPG, PNG, WEBP or PDF, up to 2 MB), or go back to the built-in one. Files are kept in this browser only.
- Replacement files are checked by their **content**, not their name: only real JPG, PNG, WEBP or PDF files up to **2 MB** are accepted; empty, damaged or renamed files are refused with a message on that row. Drop a file on a row to replace it.
- Phone widgets (incl. intl-tel-input): their country picker is never changed — it stays on the page's country (US).
- **Popup dropdowns** (Invalid data / Edge cases) are FillCraft's own: they always open inside the popup (upward near the bottom), scroll within themselves, and work fully by keyboard (arrows, Home/End, PageUp/PageDown, Enter/Space, Esc, typing a letter) with proper screen-reader roles.
- **Help & tips** now cover page errors, sections/tabs/uploads, what is never touched, and troubleshooting.
- Some uploaders send a file to the server as soon as it is attached — use this on test or staging systems.

## What's new in 1.9.0

- **Traps are never touched**: honeypot fields (off-screen, hidden, zero-size, named as traps), CAPTCHA / "I'm not a robot" boxes, and one-time / verification codes (only the person who receives them knows them).
- **More widget types**: week pickers, read-only calendar pickers (single dates and ranges — flatpickr, react-datepicker, MUI, Ant, Angular Material), rich-text editors (Quill), contenteditable and role="textbox" boxes, ARIA sliders and spin buttons, tree selects, multi-level cascaders, transfer lists, Enter-to-add tag boxes, and fields inside open and closed shadow DOM.
- **More realistic values**: split phone boxes, height with its unit, card-expiry month pickers, DOB split into Month / Day / Year dropdowns (matching the DOB), "None" never ticked with other choices, lookups (address / provider search) pick one of the page's own suggestions, Rx BIN / PCN / Group, carrier, dose, frequency, healthcare proxy, vaccine, lot number, copay, subscriber name — and repeated rows get different values.
- **Short lists vs long lists**: when a short list shown in full does not contain the patient's state/country, any of its values is used; long or searchable lists stay strict (no random country).
- **Popup builds the fill data itself**, so a background worker still holding older files can never serve outdated data.

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
