// FillCraft — your field settings ("Treat this field as…" / "Leave this field alone", set from
// the right-click menu). Shared by the service worker (menu), the popup, the Field settings page
// and the engine in pages. Saved per website in chrome.storage.local "fieldRules":
//   { "<origin>": [ { id, sig, type, label, setOn, at } ] }
// A rule names a field by its own label and stable attributes — never a value, never text taken
// from around the field.
(() => {
  // The types offered in the menu (and on the settings page), by group. Each key is one FillCraft
  // already fills; "leave" is "Leave this field alone".
  const GROUPS = [
    ['Person', [['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name'], ['fullName', 'Full name'], ['prefix', 'Title (Mr., Ms.)'], ['suffix', 'Suffix (Jr., III)'], ['dob', 'Date of birth'], ['age', 'Age'], ['gender', 'Gender / sex'], ['ssn', 'SSN'], ['ssnLast4', 'SSN — last 4'], ['maritalStatus', 'Marital status'], ['race', 'Race'], ['ethnicity', 'Ethnicity'], ['language', 'Language']]],
    ['Contact', [['email', 'Email'], ['phone', 'Phone'], ['mobile', 'Mobile phone'], ['homePhone', 'Home phone'], ['workPhone', 'Work phone'], ['altPhone', 'Secondary phone'], ['fax', 'Fax'], ['phoneExt', 'Phone extension']]],
    ['Address', [['address1', 'Street address'], ['address2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP code'], ['county', 'County'], ['country', 'Country'], ['timeZone', 'Time zone']]],
    ['Insurance', [['insuranceCarrier', 'Insurance carrier'], ['insuranceType', 'Insurance type'], ['insurancePlan', 'Plan name'], ['memberId', 'Member ID'], ['groupNumber', 'Group number'], ['policyNumber', 'Policy number'], ['mbi', 'Medicare ID (MBI)'], ['medicaidId', 'Medicaid ID'], ['subscriberName', 'Subscriber name'], ['subscriberFirstName', 'Subscriber first name'], ['subscriberLastName', 'Subscriber last name'], ['subscriberDob', 'Subscriber date of birth'], ['relationshipToSubscriber', 'Relationship to subscriber'], ['effectiveDate', 'Coverage start date'], ['terminationDate', 'Coverage end date'], ['copay', 'Copay'], ['rxBin', 'Rx BIN'], ['rxPcn', 'Rx PCN'], ['rxGroup', 'Rx group']]],
    ['Clinical', [['mrn', 'MRN'], ['patientId', 'Patient ID'], ['diagnosis', 'Diagnosis'], ['icd10', 'ICD-10 code'], ['cpt', 'CPT code'], ['medication', 'Medication'], ['currentMedications', 'Current medications'], ['allergies', 'Allergies'], ['bloodType', 'Blood type'], ['height', 'Height'], ['weight', 'Weight'], ['bp', 'Blood pressure'], ['heartRate', 'Heart rate'], ['temperature', 'Temperature'], ['vaccineName', 'Vaccine'], ['lotNumber', 'Lot number'], ['reasonForVisit', 'Reason for visit']]],
    ['Provider', [['providerName', 'Provider name'], ['npi', 'NPI'], ['dea', 'DEA number'], ['specialty', 'Specialty'], ['taxonomyCode', 'Taxonomy code'], ['licenseNumber', 'License number'], ['providerType', 'Provider type'], ['facility', 'Facility'], ['pharmacy', 'Pharmacy']]],
    ['Dates', [['today', "Today's date"], ['appointmentDate', 'Appointment date'], ['appointmentTime', 'Appointment time'], ['dateOfService', 'Date of service'], ['admissionDate', 'Admission date'], ['referralDate', 'Referral date']]],
    ['Other', [['emergencyName', 'Emergency contact name'], ['emergencyPhone', 'Emergency contact phone'], ['emergencyRelationship', 'Emergency contact relationship'], ['company', 'Employer / company'], ['jobTitle', 'Job title'], ['username', 'Username'], ['password', 'Password'], ['comment', 'Notes / comments'], ['number', 'A number'], ['website', 'Website']]],
  ];
  const LABELS = Object.fromEntries(GROUPS.flatMap(([, items]) => items));
  LABELS.leave = 'Left alone (never filled)';
  const KEY = 'fieldRules';

  // A label as rules compare it: no "*", ":" or "(required)", one space, lower case.
  const normLabel = (s) => String(s || '').replace(/\((optional|required)\)/gi, '').replace(/[*:]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  // Ids libraries make up anew on every page load (Mantine "mantine-r3k", React ":r5:",
  // react-select-12-input…) say nothing lasting about the field: not used.
  const GENERATED_ID = /^(mantine-|react-select-|headlessui-|radix-|downshift-|mui-|rc_select_|select2-|ember\d|ext-gen|j_id|cdk-|mat-input-|mat-select-|pr_id_|el-id-|vs\d|uid-)|:|\d{3,}|[a-f0-9]{8,}/i;
  const stableId = (id) => (id && !GENERATED_ID.test(id) ? id : '');

  // Does a field (its signature) answer to a rule's? Every part the rule keeps must agree; the
  // placeholder counts only for a rule that has nothing else.
  function matches(sig, rule) {
    if (!sig || !rule || !rule.sig) return false;
    const r = rule.sig;
    if (r.kind !== sig.kind || r.tag !== sig.tag) return false;
    const parts = ['label', 'name', 'id', 'testid'];
    const kept = parts.filter((p) => r[p]);
    if (kept.length) return kept.every((p) => r[p] === sig[p]);
    return !!r.placeholder && r.placeholder === sig.placeholder;
  }
  // Enough to know the field again?
  const recognisable = (sig) => !!(sig && (sig.label || sig.name || sig.id || sig.testid || sig.placeholder));

  async function all() {
    try { const v = (await chrome.storage.local.get(KEY))[KEY]; return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }
  async function write(rules) { await chrome.storage.local.set({ [KEY]: rules }); }

  // Saves (or replaces) the rule for this field on this site. Returns the saved rule.
  async function save(origin, sig, type, label, setOn) {
    const rules = await all();
    const list = (rules[origin] || []).filter((r) => !matches(sig, r));
    const rule = { id: Math.random().toString(36).slice(2, 10), sig, type, label: String(label || '').slice(0, 80), setOn: String(setOn || '').slice(0, 120), at: Date.now() };
    list.push(rule);
    rules[origin] = list;
    await write(rules);
    return rule;
  }
  // Removes this field's rule on this site; true when there was one.
  async function forget(origin, sig) {
    const rules = await all();
    const list = rules[origin] || [];
    const left = list.filter((r) => !matches(sig, r));
    if (left.length === list.length) return false;
    if (left.length) rules[origin] = left; else delete rules[origin];
    await write(rules);
    return true;
  }
  async function removeById(origin, id) {
    const rules = await all();
    const left = (rules[origin] || []).filter((r) => r.id !== id);
    if (left.length) rules[origin] = left; else delete rules[origin];
    await write(rules);
  }
  async function setType(origin, id, type) {
    const rules = await all();
    const r = (rules[origin] || []).find((x) => x.id === id);
    if (r) { r.type = type; r.at = Date.now(); await write(rules); }
  }
  async function removeSite(origin) {
    const rules = await all();
    delete rules[origin];
    await write(rules);
  }
  // Import: a file made by Export. Same field on the same site: the imported one replaces it.
  // Returns { added, replaced, skipped }.
  async function importRules(data) {
    const incoming = data && data.fieldRules && typeof data.fieldRules === 'object' ? data.fieldRules : null;
    if (!incoming) throw new Error('This is not a FillCraft field settings file');
    const rules = await all();
    let added = 0, replaced = 0, skipped = 0;
    for (const [origin, list] of Object.entries(incoming)) {
      if (!/^(https?|file):\/\//i.test(origin) && origin !== 'null' || !Array.isArray(list)) { skipped += Array.isArray(list) ? list.length : 1; continue; }
      const mine = rules[origin] || [];
      for (const r of list) {
        if (!r || !recognisable(r.sig) || !(r.type in LABELS)) { skipped++; continue; }
        const at = mine.findIndex((m) => matches(r.sig, m));
        const clean = { id: Math.random().toString(36).slice(2, 10), sig: r.sig, type: r.type, label: String(r.label || '').slice(0, 80), setOn: String(r.setOn || '').slice(0, 120), at: Number(r.at) || Date.now(), imported: true };
        if (at >= 0) { mine[at] = clean; replaced++; } else { mine.push(clean); added++; }
      }
      if (mine.length) rules[origin] = mine;
    }
    await write(rules);
    return { added, replaced, skipped };
  }
  // Export: site addresses, field labels and types — never a value.
  async function exportRules() {
    return { fillcraftFieldSettings: 1, exportedAt: new Date().toISOString(), fieldRules: await all() };
  }

  globalThis.FillCraftRules = { GROUPS, LABELS, normLabel, stableId, matches, recognisable, all, save, forget, removeById, setType, removeSite, importRules, exportRules };
})();
