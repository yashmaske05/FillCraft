// FillCraft — content script.
// Detects fillable form fields, classifies them, and fills with chosen data set.
// Supports native + custom dropdowns (React-Select, MUI, Ant Design, ARIA combobox).

// Re-running this file is intentional and safe: it registers no listeners, so each
// injection simply replaces window.__qaFormFiller with the current code. (A one-time
// guard would keep stale code alive in open tabs after the extension is reloaded.)
(function () {
  const HIGHLIGHT_CLASS = '__qa-ff-highlight';
  injectHighlightStyle();

  // Custom-dropdown filling (Pass 2) works by CLICKING a trigger open and then clicking
  // an option. On some apps that clicking navigates away / closes the form (e.g. when a
  // menu is mis-detected as a dropdown), so it is OFF unless the user enables the
  // "Custom dropdowns" setting in the popup (opts.customDropdowns, on by default). Native <select>
  // elements are always filled (Pass 1, by value — no clicking).

  // ---------- Field classification ----------
  // Pattern order matters — more specific patterns must appear before general ones.
  const PATTERNS = [
    // ---- Healthcare-specific (must come BEFORE generic phone/name patterns) ----
    ['emergencyFirstName',      [/emergency.*(first|given)[\s_-]*name|emergency.*\bf[\s_-]?name\b/i]],
    ['emergencyLastName',       [/emergency.*(last|sur|family)[\s_-]*name|emergency.*\bl[\s_-]?name\b/i]],
    ['emergencyName',           [/emergency[\s_-]*contact[\s_-]*name|emergency.*name/i]],
    // (Its mobile / cell too — but not its phone extension.)
    ['emergencyPhone',          [/emergency[\s_-]*contact[\s_-]*phone(?![\s\S]*\bext)|emergency.*(phone|number|mobile|\bcell\b|\btel\b)(?![\s\S]*\bext)/i]],
    ['emergencyRelationship',   [/emergency.*relat|relationship.*emerg/i]],
    // ("Relationship to Insured / Policy Holder / Guarantor" is the insurance relationship.)
    ['relationshipToSubscriber',[/relationship[\s\S]*(subscriber|insured|policy[\s_-]*holder|policyholder|guarantor)|(subscriber|insured|policy[\s_-]*holder|policyholder)('?s)?[\s\S]*relationship|relation[\s_-]*to[\s_-]*(insured|subscriber|policy)/i]],
    ['relationship',            [/relationship/i]],

    ['npi',           [/\bnpi\b|national[\s_-]*provider[\s_-]*id/i]],
    ['dea',           [/\bdea\b[\s_-]*(number|#)?|dea[\s_-]*registration/i]],
    ['mrn',           [/\bmrn\b|medical[\s_-]*record(\s*(number|#|id))?|chart[\s_-]*number|patient[\s_-]*record/i]],
    ['patientId',     [/patient[\s_-]*(id|number|#)/i]],
    // (An insurance / Medicare / Medicaid "card number" is the member ID, not a payment card.)
    ['memberId',      [/member[\s_-]*(id|number|#)|insurance[\s_-]*(id|number|#)|insured[\s_-]*id|policy[\s_-]*holder[\s_-]*id|card[\s_-]*holder[\s_-]*(id|number|no\b|#)|(insurance|insured|medicare|medicaid|member|health[\s_-]*plan|benefits?|dental|vision|subscriber)[\s_-]*(id[\s_-]*)?card[\s_-]*(number|no\b|#|id)/i]],
    ['subscriberId',  [/subscriber[\s_-]*(id|number|#)/i]],
    ['groupNumber',   [/group[\s_-]*(number|#|id)/i]],
    ['policyNumber',  [/policy[\s_-]*(number|#|id)/i]],
    ['insuranceCarrier',[/insurance[\s_-]*(company|carrier|provider|payer|payor)|insurances?(\s*\(s\))?[\s_-]*accepted|accepted[\s_-]*insurances?|payers?[\s_-]*accepted|payer[\s_-]*name|carrier[\s_-]*name|\bcarrier\b/i]],
    // ("Subscriber / Insured First Name" is the subscriber's, not the patient's.)
    ['subscriberFirstName', [/\b(subscriber|policy[\s_-]*holder|policyholder|insured|guarantor)('?s)?[\s_-]*(first|given)[\s_-]*name|(first|given)[\s_-]*name[\s_-]*(of[\s_-]*)?(the[\s_-]*)?(subscriber|policy[\s_-]*holder|policyholder|insured|guarantor)\b/i]],
    ['subscriberLastName',  [/\b(subscriber|policy[\s_-]*holder|policyholder|insured|guarantor)('?s)?[\s_-]*(last|sur|family)[\s_-]*name|(last|sur|family)[\s_-]*name[\s_-]*(of[\s_-]*)?(the[\s_-]*)?(subscriber|policy[\s_-]*holder|policyholder|insured|guarantor)\b/i]],
    ['subscriberName',  [/(subscriber|policy[\s_-]*holder|insured|guarantor)('?s)?[\s_-]*(full[\s_-]*)?name/i]],
    ['subscriberDob',   [/(subscriber|policy[\s_-]*holder|insured|guarantor)('?s)?[\s_-]*(date[\s_-]*of[\s_-]*birth|birth[\s_-]*date|\bdob\b)/i]],
    ['proxyName',       [/(health[\s_-]*care|medical)[\s_-]*(proxy|agent)|\bproxy\b|power[\s_-]*of[\s_-]*attorney|\bpoa\b|legal[\s_-]*guardian[\s_-]*name/i]],
    ['copay',           [/\bco-?pay(ment)?\b/i]],
    // ("Vaccine Lot #" is the lot number, matched below.)
    ['vaccineName',     [/^(?![\s\S]*\blot\b)[\s\S]*(immuni[sz]ation|vaccin(e|ation))/i]],
    // (A vaccine / drug lot — not a parking lot, nor "a lot".)
    ['lotNumber',       [/\blot[\s_-]*(number|no\.?|#)|^\s*lot\s*$|(vaccine|vial|batch|drug|medication|product)[\s_-]*lot\b/i]],
    // (A medicine's strength — not "Grip Strength".)
    ['medicationDose',  [/\bdos(e|age)\b|^\s*strength\s*$|(medication|drug|dose|tablet|pill|capsule)[\s_-]*strength/i]],
    ['medicationRoute', [/\broute\b|route[\s_-]*of[\s_-]*admin/i]],
    // ("How often do you take it?" — not "How often do you exercise?")
    ['medicationFrequency', [/\bfrequency\b|how[\s_-]*often[\s\S]*\b(take|medic\w*|dose|use|pill|tablet|inhaler)\b|times[\s_-]*(a|per)[\s_-]*day/i]],
    ['insurancePlan', [/insurance[\s_-]*plan|plan[\s_-]*name/i]],
    // (A bare "POS" on a clinical form is the Place of Service, not a POS plan.)
    ['insuranceType', [/insurance[\s_-]*type|plan[\s_-]*type|coverage[\s_-]*type|\b(hmo|ppo|epo)\b/i]],

    // ---- Coverage / generic start–end dates ----
    // Card expiry is matched first and ONLY with card context (card / cc / MM/YY /
    // valid thru); a bare "Expiration Date" is a coverage end date, not a card.
    // ("Card Expiration Month / Year" are the month / year boxes, matched further down.)
    ['ccExp',         [/^(?![\s\S]*\b(month|year)\b)[\s\S]*(valid[\s_-]*thru|\bcc[\s_-]*exp|card[\s_-]*exp|exp.*card|\bmm\s*\/?\s*yy\b(?!yy))/i]],
    ['effectiveDate', [/effective[\s_-]*(date|from|on)|\beff[\s_-]*date|coverage[\s_-]*(start|begin|from)|policy[\s_-]*start|\bstart[\s_-]*date|\bfrom[\s_-]*date|valid[\s_-]*from|enrollment[\s_-]*date/i]],
    ['terminationDate',[/\b(termination|term|expiration|expiry|expires?|exp)[\s_-]*(date|on)|coverage[\s_-]*(end|through|thru)|policy[\s_-]*end|valid[\s_-]*(to|until|through)|\bend[\s_-]*date|(?<!up[\s_-]*)\bto[\s_-]*date/i]],

    ['icd10',         [/icd[\s_-]*10|icd[\s_-]*code|diagnosis[\s_-]*code|dx[\s_-]*code/i]],
    // ("Age at Diagnosis" is an age.)
    ['diagnosis',     [/^(?![\s\S]*\bage\b)[\s\S]*(diagnosis|\bdx\b)/i]],
    ['cpt',           [/\bcpt\b|procedure[\s_-]*code|hcpcs/i]],
    ['specialty',     [/specialty|specialit(y|ies)|specialties|specialization|practice[\s_-]*area/i]],
    ['providerType',  [/provider[\s_-]*(type|title|credential)|\bcredentials?\b|\bdegree\b/i]],
    ['taxId',         [/tax[\s_-]*(id|number|no\b|#)|\btin\b|\bein\b|federal[\s_-]*(tax|id)/i]],
    ['taxonomyCode',  [/taxonomy/i]],
    ['licenseName',   [/licen[cs]e[\s_-]*(name|type|title|kind)/i]],
    ['licenseNumber', [/licen[cs]e[\s_-]*(number|no\b|#|id)|\blicen[cs]e\b/i]],
    ['providerName',  [/provider[\s_-]*name|doctor[\s_-]*name|physician[\s_-]*name|attending|referring[\s_-]*(provider|physician|doctor)|referred[\s_-]*by|primary[\s_-]*care|\bpcp\b/i]],
    ['pharmacy',      [/pharmacy/i]],
    ['currentMedications',[/current[\s_-]*medications|medication[\s_-]*list|active[\s_-]*medications/i]],
    ['rxBin',         [/\brx[\s_-]*bin\b|\bbin[\s_-]*(number|#)?\b.*\b(rx|pharmacy)|\bbin\b/i]],
    ['rxPcn',         [/\brx[\s_-]*pcn\b|\bpcn\b|processor[\s_-]*control/i]],
    ['rxGroup',       [/\brx[\s_-]*(group|grp)\b/i]],
    // ("Medication Allergies" is an allergy, matched below.)
    ['medication',    [/^(?![\s\S]*allerg)[\s\S]*(medication|prescription|\brx\b|drug[\s_-]*name)/i]],
    ['allergies',     [/allergies|known[\s_-]*allergies/i]],
    ['allergy',       [/allerg/i]],
    ['bloodType',     [/blood[\s_-]*(type|group)/i]],

    ['heightCm',      [/height.*\bcm\b|\bcm\b.*height/i]],
    ['heightFt',      [/height.*\b(ft|feet)\b|^feet$/i]],
    ['heightIn',      [/height.*\b(in|inch|inches)\b|^inches$/i]],
    ['height',        [/height/i]],
    ['weightKg',      [/weight.*\bkgs?\b|\bkgs?\b.*weight/i]],
    ['weightLb',      [/weight.*\b(lbs?|pounds?)\b|\b(lbs?|pounds?)\b.*weight/i]],
    ['weight',        [/weight/i]],
    ['bpSystolic',    [/systolic|\bsys\b|bp[\s_-]*(top|upper)/i]],
    ['bpDiastolic',   [/diastolic|\bdia\b|bp[\s_-]*(bottom|lower)/i]],
    ['bp',            [/blood[\s_-]*pressure|\bbp\b/i]],
    // ("HR" = heart rate, but not "HR contact / manager / department…" = human resources.)
    // ("Pulse Ox" / "Pulse Oximetry" is oxygen saturation, not the pulse.)
    ['heartRate',     [/heart[\s_-]*rate|\bhr\b(?![\s_-]*(contact|manager|dept|department|rep\b|representative|name|e-?mail|phone|admin|business|partner|generalist|director|specialist|coordinator|team|policy|office|person))|pulse(?![\s_-]*ox)/i]],
    ['temperature',   [/temperature|\btemp\b/i]],
    ['respiratoryRate',[/respiratory[\s_-]*rate|resp[\s_-]*rate|\brr\b/i]],
    ['oxygenSaturation',[/oxygen[\s_-]*saturation|\bspo2\b|\bo2[\s_-]*sat|pulse[\s_-]*ox/i]],

    // ---- Appointment ----
    ['appointmentDate',[/appointment[\s_-]*date|appt[\s_-]*date|scheduled[\s_-]*(date|for)|preferred[\s_-]*date|booking[\s_-]*date/i]],
    ['timeZone',     [/time[\s_-]*zone|timezone|\btz\b/i]],
    // ("Full time / Part time" is an employment status, not a time.)
    ['appointmentTime',[/appointment[\s_-]*time|appt[\s_-]*time|visit[\s_-]*time|start[\s_-]*time|preferred[\s_-]*time|(?<!(full|part)[\s_-]*)\btime\b(?![\s_-]*zone)(?![\s\S]*\b(full|part)[\s_-]*time\b)/i]],
    ['appointmentType',[/appointment[\s_-]*type|appt[\s_-]*type|visit[\s_-]*type|encounter[\s_-]*type/i]],
    ['appointmentStatus',[/appointment[\s_-]*status|appt[\s_-]*status|visit[\s_-]*status/i]],
    // (A place on the body — "Pain Location", "Location of wound" — is not a facility.)
    ['facility',      [/facility|service[\s_-]*location|clinic[\s_-]*(name|location)|practice[\s_-]*location|appointment[\s_-]*location|(?<!\b(?:pain|wound|injury|incision|lesion|rash|symptoms?|body|tumou?r|fracture|burn|ulcer|bleeding|swelling|anatomic(?:al)?)[\s_-]*)\blocation\b(?![\s_-]*(address|street|city|zip|state|of[\s_-]+(the[\s_-]+)?(pain|wound|injury|incision|lesion|rash|symptoms?|body|tumou?r|fracture|burn|ulcer|bleeding|swelling)))/i]],
    // Past visit dates (date of service) — an upcoming appointment is appointmentDate above.
    ['admissionDate', [/check[\s_-]*in[\s_-]*date|admission[\s_-]*date|admit(ted)?[\s_-]*date|move[\s_-]*in[\s_-]*date|start[\s_-]*of[\s_-]*care/i]],
    ['referralDate',  [/referral[\s_-]*date|referred[\s_-]*(on|date)|date[\s_-]*referred/i]],
    ['dateOfService', [/date[\s_-]*(given|administered)|administered[\s_-]*(on|date)|date[\s_-]*of[\s_-]*service|\bdos\b|visit[\s_-]*date|service[\s_-]*date|encounter[\s_-]*date/i]],
    ['reasonForVisit',[/reason[\s_-]*for[\s_-]*visit|reason[\s_-]*for[\s_-]*appointment/i]],
    // Bare "cc" = chief complaint, but not payment "cc-number"/"cc-exp"/"cc-name"…
    ['chiefComplaint',[/chief[\s_-]*complaint|\bcc\b(?![\s_-]*(num|no\b|exp|cvv|cvc|csc|name|type|brand|holder|card))/i]],
    ['symptoms',      [/symptoms?/i]],

    ['race',          [/\brace\b/i]],
    ['ethnicity',     [/ethnicity|hispanic[\s_-]*latino|hispanic[\s_-]*or[\s_-]*latino/i]],
    ['maritalStatus', [/marital[\s_-]*status|civil[\s_-]*status/i]],
    ['preferredLanguage',[/preferred[\s_-]*language/i]],
    ['language',      [/^languages?$|languages?[\s_-]*spoken|primary[\s_-]*language/i]],
    ['pronouns',      [/pronouns/i]],
    ['maidenName',    [/maiden[\s_-]*name/i]],
    ['sex',           [/sex[\s_-]*at[\s_-]*birth|sex[\s_-]*assigned|\bsex\b/i]],

    // ---- Identity ----
    // jobTitle must precede prefix, otherwise "Job Title" matches prefix's \btitle\b.
    // ("Position" as a word: not "Discharge Disposition" or "Composition".)
    ['jobTitle',        [/job[\s_-]*title|\bpositions?\b|occupation|\brole\b/i]],
    // ("Title" alone or a name title — not "Course Title", "Document Title".)
    ['prefix',          [/\b(prefix|salutation|honorific)\b|^\s*title\s*$|name[\s_-]*title/i]],
    ['suffix',          [/\bsuffix\b/i]],
    ['phoneticName',    [/phonetic|pronunciation|pronounced/i]],
    // ("fname" / "lname" as words: "fullname" is not "l-name".)
    ['firstName',       [/first[\s_-]*name|\bf[\s_-]?name\b|given[\s_-]*name|forename|patient[\s_-]*first/i]],
    ['lastName',        [/last[\s_-]*name|\bl[\s_-]?name\b|surname|family[\s_-]*name|patient[\s_-]*last/i]],
    // ("mname" as a word: "programName", "roomName" are not middle names.)
    ['middleName',      [/middle[\s_-]*name|\bm[\s_-]?name\b/i]],
    ['middleInitial',   [/middle[\s_-]*initial|^mi$/i]],
    // ("Cardholder ID / Number" is the member id, matched above.)
    ['fullName',        [/^name$|full[\s_-]*name|your[\s_-]*name|patient[\s_-]*name|card[\s_-]*holder(?![\s_-]*(id|number|no\b|#))/i]],
    // Bare "login" is not a username signal — "Login Email" must reach email.
    ['username',        [/user[\s_-]*name|user[\s_-]*id|login[\s_-]*(id|name)|handle|screen[\s_-]*name/i]],

    // ---- Email / Password ----
    ['emailAlt',        [/(confirm|verify|repeat).*email|email.*(confirm|verify|repeat)/i]],
    ['email',           [/e-?mail|email[\s_-]*address/i]],
    ['passwordConfirm', [/(confirm|verify|repeat).*pass(word|code|phrase)?\b|pass(word|code|phrase)?.*(confirm|verify|repeat)|re[\s_-]*type[\s_-]*pass/i]],
    // Not "passport", "passenger", "bypass", "compass".
    ['password',        [/pass[\s_-]*(word|phrase|code)|\bpass\b|\bpwd\b/i]],

    // A phone EXTENSION is a few digits, not a phone number.
    ['phoneExt',        [/\b(ext|extension)\b|phone[\s_-]*ext/i]],
    // ---- Phones (after emergencyPhone above) ----
    ['fax',             [/\bfax\b/i]],
    ['homePhone',       [/home[\s_-]*phone|home[\s_-]*number/i]],
    ['workPhone',       [/work[\s_-]*phone|office[\s_-]*phone|work[\s_-]*number|business[\s_-]*phone/i]],
    ['mobile',          [/mobile|\bcell\b|cell[\s_-]*(phone|number|no|#)|cellular/i]],
    // A second number of the same person ("Secondary Phone", "Alternate Phone", "Other Phone #").
    ['altPhone',        [/(secondary|alternate|alternative|\balt\b|other|additional|2nd|second|backup|evening)[\s_-]*(phone|tel(ephone)?|contact[\s_-]*number|number)\b/i]],
    // "tel" only as its own token or as telNumber/telNo — not "hotel", "tell us", "intel".
    ['phone',           [/phone(?!tic)|\btel(ephone)?(\b|[\s_-]|no|num)|contact[\s_-]*(number|#|phone)|primary[\s_-]*number|day[\s_-]*time[\s_-]*number/i]],

    // ---- Address ----
    // ("Unit" alone or "Unit #" is part of an address; "Nursing Unit" / "Business Unit" is not.)
    ['address2',        [/address[\s_-]*(2|line[\s_-]*2)|\bapt\b|apartment|\bsuite\b|^unit([\s_-]*(#|no\.?|number|num))?$|\bunit[\s_-]*(#|no\.|number)/i]],
    ['county',          [/\bcounty\b/i]],
    ['streetNumber',    [/(street|house|building)[\s_-]*(number|no\b|#)/i]],
    ['streetName',      [/street[\s_-]*name/i]],
    // (A web / URL / IP address is not a street address.)
    ['address1',        [/^(?![\s\S]*\b(web|url|ip|mac)[\s_-]*address)[\s\S]*(address|street|addr)/i]],
    // "City" as a word, or after an address word in an id ("billingcity") — not "Spasticity",
    // "Opacity", "Ethnicity", "Capacity", "Electricity".
    ['city',            [/\bcity|(address|billing|bill|shipping|ship|home|mailing|patient|work|residen\w*|birth|current|primary)[\s_-]*city|\btown\b|locality/i]],
    ['stateName',       [/state[\s_-]*name/i]],
    ['state',           [/\bstate\b|province|region/i]],
    ['zip4',            [/zip[\s_-]*plus|zip[\s_-]*4/i]],
    ['zip',             [/\bzip\b|postal[\s_-]*code|postcode/i]],
    // Not "vaccination", "destination", "designation", "examination".
    ['country',         [/country|\bnation(ality)?\b/i]],

    // ---- Demographics ----
    // Not "place/country of birth".
    ['dob',             [/date[\s_-]*of[\s_-]*birth|birth[\s_-]*(date|day)|\bdob\b|\bbday\b/i]],
    ['age',             [/\bage\b/i]],
    ['ssnLast4',        [/ssn.*(last|4)|last[\s_-]*4.*ssn|(last|final)[\s_-]*(4|four)[\s\S]*social[\s_-]*security|social[\s_-]*security[\s\S]*(last|final)[\s_-]*(4|four)/i]],
    ['ssn',             [/\bssn\b|social[\s_-]*security/i]],
    ['gender',          [/\bgender\b/i]],

    // ---- Employment / Web ----
    ['yearsExperience', [/(years?|yrs?)[\s_-]*(of[\s_-]*)?(experience|practice|service)|experience[\s_-]*\(?\s*(in[\s_-]*)?(years?|yrs?)\s*\)?|\byoe\b/i]],
    ['hoursPerWeek',    [/hours?[\s_-]*(per|\/|a|each)[\s_-]*week|weekly[\s_-]*hours|hrs?[\s_-]*\/[\s_-]*w(ee)?k/i]],
    ['hourlyRate',      [/hourly[\s_-]*(rate|pay|wage)|pay[\s_-]*rate|rate[\s_-]*(of[\s_-]*pay|per[\s_-]*hour)|\bwage\b/i]],
    ['salary',          [/salary|annual[\s_-]*(pay|income|compensation|earnings|wage)|yearly[\s_-]*(pay|income)|gross[\s_-]*(annual[\s_-]*)?(pay|income)/i]],
    ['company',         [/company|organi[sz]ation|employer|business[\s_-]*name/i]],
    ['website',         [/website|web[\s_-]*site|homepage|web[\s_-]*address|url[\s_-]*address/i]],
    ['url',             [/\burl\b|\blink\b/i]],

    // ---- Payment ----
    // Bank "account number" is not a card — it falls through to the label fallback.
    // ("Credit Card Type / Brand / Holder / Expiration" are not the number.)
    ['ccNumber',        [/card[\s_-]*(number|no\b|#)|cc[\s_-]*num|(credit|debit)[\s_-]*card(?![\s_-]*(type|brand|holder|name|exp\w*|issuer|network))|\bccn\b/i]],
    ['ccCvv',           [/\bcvv2?\b|\bcvc\b|\bcsc\b|security[\s_-]*code|card[\s_-]*verification/i]],
    // Anchored on exp/expiry/expiration so "years of experience" does not match.
    ['ccExpMonth',      [/exp(iry|iration)?\.?[\s_-]*(date[\s_-]*)?(month|mm)\b|month[\s_-]*(of[\s_-]*)?exp(iry|iration)\b/i]],
    ['ccExpYear',       [/exp(iry|iration)?\.?[\s_-]*(date[\s_-]*)?(year|yy|yyyy)\b|year[\s_-]*(of[\s_-]*)?exp(iry|iration)\b/i]],
    ['ccName',          [/name[\s_-]*on[\s_-]*card|card[\s_-]*holder|\bcc[\s_-]*name\b/i]],

    // ---- Numeric / generic ----
    ['quantity',        [/quantity|\bqty\b|\bcount\b|\b(no|number|num)\.?\s+of\b|how\s+many|#\s*of\b/i]],
    ['amount',          [/amount|price|cost|total|salary|income|copay/i]],
    // Only a bare "number" field. "License number", "Employee #" etc. go to the
    // label fallback (smartValueForLabel), which has specific generators for them.
    ['number',          [/^(number|num)$/i]],
    ['bio',             [/\bbio(graphy)?\b|about\s+(you|yourself|me)\b|^(?![\s\S]*\b(comments?|feedback|complaints?|concerns?|reviews?|notes?|remarks?|questions?|reasons?|incidents?)\b)[\s\S]*\babout\s+(the\s+|this\s+)?(employee|staff(\s+member)?|team\s+member|provider|clinician|physician|doctor|nurse|caregiver|therapist|candidate|applicant|author|speaker|instructor|trainer)\b|description|summary/i]],
    ['comment',         [/comment|message|^notes?$|feedback|details|additional[\s_-]*info/i]],
  ];

  const AUTOCOMPLETE_MAP = {
    'name': 'fullName',
    'given-name': 'firstName',
    'family-name': 'lastName',
    'additional-name': 'middleName',
    'honorific-prefix': 'prefix',
    'honorific-suffix': 'suffix',
    'nickname': 'username',
    'username': 'username',
    'new-password': 'password',
    'current-password': 'password',
    'email': 'email',
    'tel': 'phone',
    'tel-national': 'phoneDigits',
    'tel-area-code': 'phoneAreaCode',
    'street-address': 'address1',
    'address-line1': 'address1',
    'address-line2': 'address2',
    'address-level2': 'city',
    'address-level1': 'state',
    'postal-code': 'zip',
    'country': 'countryCode',
    'country-name': 'country',
    'bday': 'dob',
    'organization': 'company',
    'organization-title': 'jobTitle',
    'cc-name': 'ccName',
    'cc-number': 'ccNumber',
    'cc-exp': 'ccExp',
    'cc-exp-month': 'ccExpMonth',
    'cc-exp-year': 'ccExpYear',
    'cc-csc': 'ccCvv',
    'cc-type': 'ccBrand',
    'url': 'url',
  };

  // Label lookups are cached for the duration of one fill/detect/clear (labels do not
  // change mid-run, and each field's label is needed several times).
  let labelCache = null;
  function withLabelCache(fn) {
    labelCache = new Map();
    const done = () => { labelCache = null; };
    try {
      const r = fn();
      if (r && typeof r.then === 'function') return r.finally(done);
      done();
      return r;
    } catch (e) {
      done();
      throw e;
    }
  }

  function getLabelText(el) {
    if (labelCache) {
      if (labelCache.has(el)) return labelCache.get(el);
      const t = computeLabelText(el);
      labelCache.set(el, t);
      return t;
    }
    return computeLabelText(el);
  }

  // A label's own words, without the text of a <select> / <textarea> nested inside it
  // (a label wrapping a dropdown would otherwise read "RelationshipSelectSelfSpouse…").
  function labelOwnText(l) {
    if (!l.querySelector('select, textarea, datalist')) return l.textContent || '';
    const c = l.cloneNode(true);
    c.querySelectorAll('select, textarea, datalist').forEach((n) => n.remove());
    return c.textContent || '';
  }

  function computeLabelText(el) {
    const parts = [];
    if (el.labels && el.labels.length) {
      for (const l of el.labels) parts.push(labelOwnText(l));
    } else if (el.id) {
      const lab = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (lab) parts.push(lab.textContent || '');
    }
    const aria = el.getAttribute('aria-label');
    if (aria) parts.push(aria);
    const ariaBy = el.getAttribute('aria-labelledby');
    if (ariaBy) {
      ariaBy.split(/\s+/).forEach(id => {
        const node = document.getElementById(id);
        if (node) parts.push(node.textContent || '');
      });
    }
    if (parts.length) return [...new Set(parts.map((p) => p.trim()).filter(Boolean))].join(' ').trim();

    // Wrapper <label>
    const wrapperLabel = el.closest('label');
    if (wrapperLabel) return labelOwnText(wrapperLabel).trim();

    return nearestPrecedingLabel(el) || precedingColumnText(el);
  }

  const FIELD_SELECTOR = 'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]), textarea, select';

  // Design systems often nest the input several levels below its visible label with
  // no for/id link. Find the label that comes CLOSEST BEFORE the element (not the
  // first label in the container, which would usually belong to another field), and
  // reject it if another form field sits between the two — then it is that field's label.
  function nearestPrecedingLabel(el, maxDepth = 6) {
    const LABEL_SEL = 'label, legend, [class*="label" i]:not(input):not(textarea):not(select)';
    const precedes = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    let node = el.parentElement;
    let depth = 0;
    while (node && depth < maxDepth) {
      let best = null;
      for (const lab of node.querySelectorAll(LABEL_SEL)) {
        if (lab.contains(el) || el.contains(lab)) continue;
        if (!precedes(lab, el)) continue;
        // A <label> explicitly bound to a different control is not ours.
        if (lab.tagName === 'LABEL' && lab.control && lab.control !== el) continue;
        // A label inside another field's own box (MUI repeats a field's name in its outlined
        // border as a <legend>) belongs to that field.
        if (ownedByOtherField(lab, el)) continue;
        const txt = (lab.textContent || '').trim();
        if (!txt || txt.length >= 200) continue;
        best = lab; // document order → the last match is the closest preceding one
      }
      if (best) {
        for (const f of node.querySelectorAll(FIELD_SELECTOR)) {
          if (f !== el && !best.contains(f) && precedes(best, f) && precedes(f, el)) return '';
        }
        return (best.textContent || '').trim();
      }
      node = node.parentElement;
      depth++;
    }
    return '';
  }

  // True when the field has no label of its own (label element, aria-label / labelledby,
  // wrapping label, nearby label element): what names it is plain text next to it.
  function labelFromContext(el) {
    if (el.labels && el.labels.length) return false;
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && document.querySelector(`label[for="${cssEscape(el.id)}"]`)) return false;
    if (el.closest('label')) return false;
    const inner = el.querySelector && el.querySelector('label, .MuiInputLabel-root, legend, [aria-label]');
    if (inner) return false;
    return !nearestPrecedingLabel(el);
  }

  const FIELD_BOX_SEL = '.MuiFormControl-root, .MuiTextField-root, .MuiInputBase-root, .MuiOutlinedInput-notchedOutline, mat-form-field, .ant-form-item, .el-form-item, .v-input';
  function ownedByOtherField(lab, el) {
    for (let box = lab.closest(FIELD_BOX_SEL); box; box = box.parentElement && box.parentElement.closest(FIELD_BOX_SEL)) {
      if (box.contains(el) || el.contains(box)) return false;
      if (box.querySelector('input:not([type=hidden]), select, textarea, [role="combobox"], [aria-haspopup="listbox"]')) return true;
    }
    return false;
  }

  // "Label column" layouts label a field with plain text in the previous column —
  // <div class="col-3">Gender</div><div class="col-9">…field…</div> — no <label> at
  // all. Walk up from the field; at each level, the previous sibling's short text is
  // the label, as long as this level holds no other field (then it would be theirs).
  function precedingColumnText(el, allowed = [el]) {
    let a = el;
    for (let d = 0; a && d < 4; d++) {
      if (a !== el && Array.from(a.querySelectorAll(FIELD_SELECTOR)).some((f) => !allowed.includes(f))) return '';
      const p = a.previousElementSibling;
      // (Visible text only — libraries put hidden screen-reader text before controls.)
      if (p && !p.matches(FIELD_SELECTOR) && !p.querySelector(FIELD_SELECTOR) && isVisible(p)) {
        const t = (p.innerText || p.textContent || '').trim();
        if (t && t.length <= 60) return t;
      }
      a = a.parentElement;
    }
    return '';
  }

  // Keys that a generic label ("Name", "Address", "Phone", "Number"…) produces; a more
  // specific internal name (firstName, addressLine2, mobilePhone) should win over them.
  const GENERIC_KEYS = new Set(['fullName', 'address1', 'phone', 'number', 'quantity', 'amount', 'comment', 'bio', 'relationship', 'username']);

  // The visible label is what the field IS; internal names are often prefixed by their
  // form group ("addressCity", "address.zip") and would make City / ZIP / State look
  // like "address". So: label first — unless the label is generic and the name is more
  // specific.
  // A label that ENDS in a format word is that format, whatever comes before it:
  // "Pharmacy Phone" is a phone number (not a pharmacy), "PCP Phone" is not the doctor's
  // name, "Pharmacy Email" is an email.
  const FORMAT_WORDS = [
    [/\bfax(\s*(no\.?|number|#))?$/i, () => 'fax'],
    [/\b(phone|telephone|tel|mobile|cell)(\s*(no\.?|number|#))?$/i, (k) => (PHONE_KEYS.includes(k) && k !== 'fax' ? k : 'phone')],
    [/\be-?mail(\s*(address|id))?$/i, (k) => (k === 'email' || k === 'emailAlt' ? k : 'email')],
    [/\b(zip|postal)(\s*code)?$/i, (k) => (k === 'zip' ? k : 'zip')],
    // ("DEA Expiry Date" is an end date — in the future — not today.)
    [/\bdate$/i, (k, t) => (DATE_KEYS.includes(k) || k === 'ccExp' ? k : /\bexpir|\bexpires|\bend\b|\btermination|valid\s*(until|thru|through)|\brenewal/i.test(t) ? 'terminationDate' : 'today')],
    // "Pharmacy Address", "PCP Address", "Insurance Company Address": an address, not the
    // pharmacy / doctor / insurer. ("Email Address" and "Web Address" are caught above.)
    [/\b(street|mailing|home|billing|physical|postal|residential|business|office)?\s*address(\s*(line\s*)?1)?$/i, (k) => (['address1', 'address2', 'streetNumber', 'streetName', 'email', 'emailAlt', 'url', 'website'].includes(k) ? k : 'address1')],
    [/\bcity$/i, () => 'city'],
    [/\bcounty$/i, () => 'county'],
    [/\bstate(\s*\/\s*province)?$/i, (k) => (k === 'state' || k === 'stateName' ? k : 'state')],
  ];
  function formatWordKey(labelText, key) {
    const t = String(labelText || '').replace(/\(optional\)|\*/gi, '').replace(/\s+/g, ' ').trim();
    for (const [re, pick] of FORMAT_WORDS) if (re.test(t)) return pick(key, t);
    return key;
  }

  function resolveKey(labelText, attrParts) {
    // A label's required / optional marks and punctuation are not part of what it asks
    // ("Pharmacy Phone:", "Name *", "Zip (required)" — anchored rules need the bare words).
    if (labelText) labelText = String(labelText).replace(/\((optional|required)\)/gi, '').replace(/^[\s*:]+|[\s*:.]+$/g, '').trim();
    // "Reason for leaving previous employer" is a reason, not the employer. (A visit's /
    // referral's reason is a recognised field of its own.)
    if (labelText && /^\s*(reason|why)\b/i.test(labelText) && !/visit|appointment|referral|admission|consult|encounter/i.test(labelText)) return null;
    const rawLabelKey = labelText ? matchPatterns([labelText]) : null;
    const byLabel = labelText ? formatWordKey(labelText, rawLabelKey) : null;
    const byAttrs = matchPatterns(attrParts);
    let key = byLabel || byAttrs;
    if (byLabel && byAttrs && byLabel !== byAttrs) {
      // A label that says only a format ("Date", "Address") or a generic word says less than a
      // specific id / name (appointmentDate, addressLine2, mobilePhone).
      const vague = !rawLabelKey || GENERIC_KEYS.has(byLabel);
      key = vague && !GENERIC_KEYS.has(byAttrs) ? byAttrs : byLabel;
    }
    // A label that names another kind of unit ("Nursing Unit", "Business Unit") beats an
    // id / name of just "unit".
    if (key === 'address2' && !byLabel && labelText && /\b[a-z]+\s+unit\b/i.test(labelText) && !/apt|apartment|suite|address/i.test(labelText)) return null;
    // "Healthcare proxy phone" is a phone even if its name (healthcare_proxy_phone) says proxy.
    return labelText ? formatWordKey(labelText, key) : key;
  }

  // Returns the first PATTERNS key matching the combined haystack or any single part
  // (anchored patterns such as /^name$/ can only match an individual part).
  // Each part is also tried in a normalised form — camelCase split and "_" as a
  // space — because \b treats "_" as a word character: without it "patient_dob",
  // "home_zip" or "patientDob" would never match /\bdob\b/, /\bzip\b/.
  function matchPatterns(parts) {
    const raw = parts.map((p) => String(p || '').trim()).filter(Boolean);
    const normalised = raw.map((p) => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_+/g, ' '));
    const clean = [...new Set([...raw, ...normalised].map((p) => p.toLowerCase()))];
    if (!clean.length) return null;
    const haystack = clean.join(' ');
    for (const [key, regs] of PATTERNS) {
      for (const r of regs) {
        if (r.test(haystack) || clean.some((p) => r.test(p))) return key;
      }
    }
    return null;
  }

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
  }

  // Walk up to N ancestors and return the first whose className contains any of the
  // regex patterns. Used to detect "this input is inside a phone-input widget".
  function ancestorClassMatches(el, regex, maxDepth = 4) {
    let n = el?.parentElement;
    let depth = 0;
    while (n && depth < maxDepth) {
      const cls = (typeof n.className === 'string') ? n.className.toLowerCase() : '';
      if (cls && regex.test(cls)) return n;
      n = n.parentElement;
      depth++;
    }
    return null;
  }

  // ---------- Navigation-safety guards ----------
  // The custom-dropdown logic CLICKS things (triggers + options). If it mistakes a
  // site nav menu (navbar, user menu, sidebar) for a form dropdown, it can click a
  // menu item like "Logout"/"Settings" and navigate away — closing the form. These
  // guards keep filling confined to actual form controls.
  const NAV_CLASS_RE = /(?:^|[\s_-])(?:navbar|nav-bar|navigation|topbar|top-bar|sidebar|side-bar|site-header|app-header|page-header|main-menu|nav-menu|navmenu|menu-bar|menubar|breadcrumb|toolbar|header-nav|nav-link|navlink)(?:[\s_-]|$)/i;

  // ---------- Page validation errors ("Enter a number between 0 and 99") ----------
  // Elements that hold a field's error message, across common libraries.
  const ERROR_TEXT_SEL = [
    '.MuiFormHelperText-root.Mui-error', 'mat-error', '.mat-mdc-form-field-error', '.ant-form-item-explain-error',
    '.invalid-feedback', '.error-message', '.errorMessage', '.field-error', '.form-error', '.input-error',
    '.text-danger', '.help-block', '.v-messages__message', '.p-error', '[role="alert"]',
    '[class*="error-text" i]', '[class*="errortext" i]', '[class*="error-msg" i]', '[class*="errormsg" i]',
    '[class~="err"]', '[class*="err-" i]', '[class*="-err" i]', '[id*="error" i]', '[id$="-err" i]', '[class*="validation" i]', '[class*="invalid-" i]',
    'p[class*="error" i]', 'span[class*="error" i]', 'small[class*="error" i]', 'div[class*="error" i]',
  ].join(', ');

  // The error the page shows for this field right now: { message } or null. Looks only
  // in the field's own wrapper (the closest ancestors holding no other field) and right
  // after it — never a page-wide toast.
  // A message on its way out (Ant Design and Vue fade an error away once it is fixed).
  const LEAVING_SEL = '.ant-show-help-leave, .ant-show-help-leave-active, [class*="-leave-active"], [class*="-leave-to"], .fade-leave-active';

  // What the field's wrapper shows before FillCraft types into it: help lines and rule
  // lists that are always there are not errors caused by the value.
  function errorSnapshot(el) {
    const r = errorTexts(el);
    return { texts: new Set(r.texts), invalid: r.invalid };
  }

  // before: errorSnapshot(el) taken before the field was filled — text that was already
  // showing then is not an error about the value.
  function fieldError(el, before) {
    if (!el || !el.isConnected) return null;
    const { texts: all, invalid } = errorTexts(el);
    const texts = before ? all.filter((t) => !before.texts.has(t)) : all;
    // The browser's own checks (pattern / min / max / type), not "required" — we filled it.
    if (!texts.length && el.willValidate && el.validity && !el.validity.valid && !el.validity.valueMissing) {
      texts.push(el.validationMessage || 'Invalid value');
    }
    // A "(help)" line is not an error unless the field is marked invalid or it reads like one.
    const errorish = /invalid|must|only|enter|between|required|allowed|format|at least|at most|maximum|minimum|too (long|short)|not valid|please/i;
    const msgs = texts.filter((t) => invalid || errorish.test(t));
    // Marked invalid only now (it was not before FillCraft typed): an error without words.
    if (!msgs.length) return invalid && !(before && before.invalid) ? { message: '' } : null;
    return { message: msgs.join(' · ') };
  }

  function errorTexts(el) {
    if (!el || !el.isConnected) return { texts: [], invalid: false };
    let scope = null;
    for (let box = el.parentElement, i = 0; box && box !== document.body && i < 5; box = box.parentElement, i++) {
      if (box.querySelectorAll('input:not([type=hidden]), select, textarea').length > 1) break;
      scope = box;
    }
    const texts = [];
    const take = (n) => {
      if (!n || n.contains(el) || !isVisible(n) || n.closest(LEAVING_SEL)) return;
      // (A label turning red — "Mui-error" — is the field's name, not its message.)
      if (n.matches('label, legend, .MuiFormLabel-root, .MuiInputLabel-root, .ant-form-item-label, .mat-mdc-floating-label')) return;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 200 && !texts.includes(t)) texts.push(t);
    };
    const ids = ((el.getAttribute('aria-errormessage') || '') + ' ' + (el.getAttribute('aria-describedby') || '')).split(/\s+/).filter(Boolean);
    const invalid = el.getAttribute('aria-invalid') === 'true' ||
      !!el.closest('.Mui-error, .mat-form-field-invalid, .mat-mdc-form-field-invalid, .ant-form-item-has-error, .has-error, .is-invalid, .p-invalid') ||
      el.classList.contains('is-invalid');
    for (const id of ids) {
      const n = document.getElementById(id);
      if (n && (invalid || n.matches(ERROR_TEXT_SEL))) take(n);
    }
    if (scope) {
      scope.querySelectorAll(ERROR_TEXT_SEL).forEach(take);
      const next = scope.nextElementSibling;
      if (next && next.matches(ERROR_TEXT_SEL)) take(next);
    }
    return { texts, invalid };
  }

  // A string matching a simple HTML pattern: literals, [classes], \d \w \s, and the
  // quantifiers ? * + {n} {n,m}. Anything fancier (groups, alternation) → null.
  function valueFromPattern(pattern) {
    try {
      if (/[()|]/.test(pattern.replace(/\\./g, ''))) return null; // groups / alternation (escaped ones are fine)
      const pickFrom = (chars) => chars[Math.floor(Math.random() * chars.length)];
      const DIG = '0123456789', UP = 'ABCDEFGHJKLMNPRSTUVWXYZ', LOW = 'abcdefghijkmnpqrstuvwxyz';
      const classChars = (body) => {
        const neg = body.startsWith('^');
        if (neg) return null;
        let out = '';
        for (let i = 0; i < body.length; i++) {
          if (body[i] === '\\') { const e = body[++i]; out += e === 'd' ? DIG : e === 'w' ? UP + LOW + DIG : e === 's' ? ' ' : e; continue; }
          if (body[i + 1] === '-' && body[i + 2] && body[i + 2] !== ']') {
            for (let c = body.charCodeAt(i); c <= body.charCodeAt(i + 2); c++) out += String.fromCharCode(c);
            i += 2;
          } else out += body[i];
        }
        return out || null;
      };
      let result = '';
      let i = 0;
      const p = pattern.replace(/^\^/, '').replace(/\$$/, '');
      while (i < p.length) {
        let chars;
        if (p[i] === '[') {
          const end = p.indexOf(']', i + 1);
          if (end < 0) return null;
          chars = classChars(p.slice(i + 1, end));
          if (!chars) return null;
          i = end + 1;
        } else if (p[i] === '\\') {
          const e = p[i + 1];
          chars = e === 'd' ? DIG : e === 'w' ? UP + LOW + DIG : e === 's' ? ' ' : e;
          i += 2;
        } else if (p[i] === '.') { chars = UP + LOW + DIG; i++; }
        else { chars = p[i]; i++; }
        let n = 1;
        const q = p.slice(i).match(/^(\{(\d+)(?:,(\d*))?\}|\?|\*|\+)/);
        if (q) {
          if (q[1] === '?' || q[1] === '*') n = q[1] === '?' ? 1 : 2;
          else if (q[1] === '+') n = 2;
          else n = Number(q[2]);
          i += q[0].length;
        }
        for (let k = 0; k < n; k++) result += chars.length === 1 ? chars : pickFrom(chars);
      }
      return new RegExp('^(?:' + pattern + ')$').test(result) ? result : null;
    } catch (_) { return null; }
  }

  // Text of at most n characters, cut at a sentence end (or else a word end) — never
  // mid-word.
  function cutText(text, n) {
    const s = String(text);
    if (s.length <= n) return s;
    const head = s.slice(0, n);
    if (s[n] === ' ' && /[.!?]$/.test(head)) return head;
    const dot = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (dot >= n * 0.4) return head.slice(0, dot + 1);
    const sp = head.lastIndexOf(' ');
    return (sp > 0 ? head.slice(0, sp) : head).replace(/[,;:]$/, '');
  }

  // The first n words, ending with a full stop.
  function cutWords(text, n) {
    const w = String(text).trim().split(/\s+/).slice(0, n).join(' ');
    return /[.!?]$/.test(w) ? w : w.replace(/[,;:]$/, '') + '.';
  }

  // Text grown with more note sentences (from the generated notes) until it has at
  // least `words` words / `chars` characters.
  function extendText(text, dataset, { words = 0, chars = 0 } = {}) {
    const sentences = (String(dataset.notes || '') + ' ' + String(dataset.comment || ''))
      .split(/(?<=[.!?])\s+/).filter(Boolean);
    if (!sentences.length) return text;
    let out = String(text).trim();
    const enough = () => out.split(/\s+/).filter(Boolean).length >= words && out.length >= chars;
    for (let i = 0; !enough() && i < 500; i++) out += (out ? ' ' : '') + sentences[i % sentences.length];
    return out;
  }

  // Values that satisfy a page's error message, best first. The field's current value,
  // label and the generated data are used; an empty list means "no idea".
  function valuesForError(msg, el, key, dataset) {
    const m = String(msg || '').toLowerCase();
    const label = String(getLabelText(el) || '').toLowerCase();
    const cur = String(el.value || '');
    const out = [];
    const add = (v) => { if (v != null && String(v) !== '' && String(v) !== cur && !out.includes(String(v))) out.push(String(v)); };
    const num = (s) => Number(String(s).replace(/,/g, ''));
    const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const charRule = /char|letter|length|long|short/.test(m);
    // The field's pattern accepts it (when it has one).
    const fitsPattern = (s) => {
      if (!el.pattern) return true;
      for (const flags of ['v', 'u', '']) { try { return new RegExp('^(?:' + el.pattern + ')$', flags).test(s); } catch (_) { /* next */ } }
      return true;
    };

    // The field's own HTML limits say exactly what fits: its min / max (dates, months,
    // numbers, times), its maxlength, its step.
    const v = el.validity || {};
    if (v.rangeOverflow && el.max) add(el.max);
    if (v.rangeUnderflow && el.min) add(el.min);
    if (v.tooLong && el.maxLength > 0) add(cur.slice(0, el.maxLength));
    if (v.stepMismatch && el.type === 'number') add(fitNumber(el, cur));
    if (v.stepMismatch && el.type === 'time') add(fitTime(el, cur));

    // (Whole words: "cancellation", "excellent" and "Phone Ext" are not phone numbers.)
    if (/\b(phone|mobile|cell|fax|telephone)\b(?![\s_-]*ext)/.test(m + ' ' + label)) {
      // The same number (the field's own, else the patient's) in the usual formats — those
      // the field's pattern accepts first. A made-up number only as the last resort.
      const d = cur.replace(/\D/g, '').slice(-10);
      const digits = d.length === 10 ? d : String(dataset.phoneDigits || '');
      if (digits.length === 10) {
        const forms = [`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, digits,
          `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`, '+1 ' + digits, `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`];
        forms.filter(fitsPattern).forEach(add);
        forms.forEach(add);
      }
      if (el.pattern) add(valueFromPattern(el.pattern));
      return out;
    }
    if (el.pattern) add(valueFromPattern(el.pattern));
    if ((el.type || '').toLowerCase() === 'password' || key === 'password' || key === 'passwordConfirm') {
      // "Passwords do not match": use the other password box's value.
      if (/match|same|identical|differ/.test(m)) {
        const scope = el.form || document;
        const other = Array.from(scope.querySelectorAll('input[type="password"]')).find((p) => p !== el && p.value);
        if (other) add(other.value);
      }
      const atLeast = m.match(/(?:at\s*least|minimum(?:\s*of)?|min\.?)\s*(\d+)\s*(?:char|letter)/);
      const atMost = m.match(/(?:at\s*most|maximum(?:\s*of)?|max\.?|no\s*more\s*than|up\s*to)\s*(\d+)\s*(?:char|letter)/);
      const min = atLeast ? Number(atLeast[1]) : (el.minLength > 0 ? el.minLength : 0);
      const max = atMost ? Number(atMost[1]) : (el.maxLength > 0 ? el.maxLength : Infinity);
      let variants = passwordVariants(formPasswords.get(passwordScope(el)) || dataset.password || 'Admin@1234', dataset, min, max);
      // "Too common", "can't contain admin / your name / username": skip the base password.
      if (/common|weak|guess|breach|compromis|pwned|dictionary|contain|include|similar|username|user\s*name|\bname\b|email/.test(m)) variants = variants.slice(1);
      variants.forEach(add);
      return out;
    }
    // "Already registered / taken / in use": another address or user name of the same person.
    const taken = /already|taken|exists|in use|registered|duplicate|unique|not available|unavailable/.test(m);
    if (/e-?mail/.test(m)) {
      add(dataset.email);
      if (taken || String(dataset.email) === cur) {
        const [local, domain] = String(dataset.email || 'test.user@mailinator.com').split('@');
        add(`${local.replace(/\.\d+$/, '')}.${rand(1000, 9999)}@${domain || 'mailinator.com'}`);
      }
      return out;
    }
    if (taken && /user\s*name|username|login|handle/.test(m + ' ' + label)) {
      add(`${String(dataset.username || 'testuser').replace(/\d+$/, '')}${rand(100, 999)}`);
      return out;
    }
    if (/\bzip\b|postal/.test(m)) { add(String(dataset.zip || '').slice(0, 5)); return out; }
    if (/ssn|social security/.test(m)) { add(dataset.ssn); add(String(dataset.ssn || '').replace(/\D/g, '')); return out; }
    if (/url|website|web address|link/.test(m)) {
      // "Enter a valid Slack URL": that site's profile address first, then the other forms
      // sites accept (only the first few values are tried).
      const about = m + ' ' + label;
      const h = String(dataset.username || 'testuser').replace(/[^a-z0-9_]/gi, '').slice(0, 15) || 'testuser';
      const team = String(dataset.lastName || 'team').toLowerCase().replace(/[^a-z0-9-]/g, '');
      add(socialProfile(about, dataset));
      if (/\bslack\b/.test(about)) { add(`https://${team}.slack.com`); add(`https://${team}-team.slack.com`); }
      if (/\btwitter\b|\bx\b/.test(about)) { add(`https://twitter.com/${h}`); add(`https://www.x.com/${h}`); }
      if (/linkedin/.test(about)) add(`https://www.linkedin.com/in/${dataset.username}`);
      add(dataset.url);
      add(dataset.website);
      return out;
    }

    // Number ranges: "between 0 and 99", "0-99", "from 1 to 10".
    const range = m.match(/between\s+(-?[\d.,]+)\s*(?:and|to|-|–)\s*(-?[\d.,]+)/) ||
      m.match(/from\s+(-?[\d.,]+)\s*(?:to|-|–)\s*(-?[\d.,]+)/) ||
      (!charRule && m.match(/(-?[\d.,]+)\s*(?:-|–|to)\s*(-?[\d.,]+)/));
    const minM = m.match(/(?:at least|minimum(?: of)?|min\.?|greater than or equal to|no less than|>=)\s*(-?[\d.,]+)/);
    const maxM = m.match(/(?:at most|maximum(?: of)?|max\.?|less than or equal to|no more than|up to|<=|cannot exceed|not exceed)\s*(-?[\d.,]+)/);

    // Word limits ("minimum 150 words", "no more than 50 words").
    const wordsM = m.match(/(\d+)\s*words?\b/);
    if (wordsM) {
      const n = num(wordsM[1]);
      if (/max|at most|no more than|up to|less than|cannot exceed|not exceed|limit/.test(m)) add(cutWords(cur, n));
      else add(extendText(cur, dataset, { words: n }));
    }
    if (charRule) {
      // Sentences (notes, comments) grow with more sentences and are cut at a sentence
      // end; single values are cut / padded as characters (an id with digits by digits).
      const prose = /\s/.test(cur.trim());
      const shorter = (n) => (prose ? cutText(cur, n) : cur.slice(0, n));
      const pad = /\d/.test(cur) ? '0123456789' : 'abcdefghij';
      const longer = (n) => (prose ? extendText(cur, dataset, { chars: n }) : cur + pad.repeat(5).slice(0, Math.max(0, n - cur.length)));
      const fitLen = (n) => (cur.length > n ? shorter(n) : longer(n));
      // "exactly 9 characters", "must be 9 characters (long)", "9-12 characters".
      const exact = m.match(/exactly\s*(\d+)\s*(?:char|letter|digit)/) || m.match(/(?:must|should)\s+be\s+(\d+)\s*(?:char|letter)/);
      const span = m.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:char|letter)/);
      if (exact) add(fitLen(num(exact[1])));
      if (span) { const lo = num(span[1]), hi = num(span[2]); add(cur.length > hi ? shorter(hi) : longer(lo)); }
      if (maxM) add(shorter(num(maxM[1])));
      if (minM) add(longer(num(minM[1])));
      if (range && !span) { const lo = num(range[1]), hi = num(range[2]); add(cur.length > hi ? shorter(hi) : longer(lo)); }
    }
    const exactDigits = m.match(/(\d+)\s*digits?/);
    if (exactDigits) {
      const n = num(exactDigits[1]);
      if (n >= 1 && n <= 20) add(String(dataset.phoneDigits || '1234567890').repeat(3).slice(0, n));
    }
    if (!charRule && (range || minM || maxM)) {
      const lo = range ? num(range[1]) : minM ? num(minM[1]) : 0;
      const hi = range ? num(range[2]) : maxM ? num(maxM[1]) : lo + 10;
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
        const whole = Number.isInteger(lo) && Number.isInteger(hi);
        add(whole ? rand(lo, Math.min(hi, lo + 10)) : ((lo + Math.min(hi, lo + 10)) / 2).toFixed(1));
        add(lo);
      }
    }
    if (/\bnumber\b|numeric|integer|whole|digits? only|only (numbers|digits)|must be a number|not a number/.test(m)) {
      add(dataset.quantity || rand(1, 5));
      add(cur.replace(/\D/g, ''));
    }
    if (/letter|alphabet|no (numbers|digits)|only (characters|text)|special character/.test(m)) {
      add(/name/.test(label) ? dataset.fullName : dataset.firstName);
      add(cur.replace(/[^A-Za-z\s'.-]/g, '').trim());
    }
    // (Whole word: "could not be validated", "update", "candidate" are not about a date.)
    if (/\bdates?\b|mm\/dd|dd\/mm|yyyy/.test(m)) {
      // The format the message asks for ("Enter the date as YYYY-MM-DD"), else the field's.
      const f = m.match(/(y{2,4}|m{1,2}|d{1,2})([-\/. ])(y{2,4}|m{1,2}|d{1,2})\2(y{2,4}|m{1,2}|d{1,2})/);
      const inFormat = (iso) => {
        if (!f) return formatDateFor(el, iso);
        const [y, mo, d] = iso.split('-');
        const part = (tok) => (tok[0] === 'y' ? (tok.length === 2 ? y.slice(2) : y) : tok[0] === 'm' ? mo : d);
        return [f[1], f[3], f[4]].map(part).join(f[2]);
      };
      // (A date already in the box is read back first: it may be the field's own date.)
      const fmt = (val) => { const iso = toISODate(val); return isRealDate(iso) ? inFormat(iso) : null; };
      const own = DATE_KEYS.includes(key) ? dataset[key] : null;
      if (/past|before today|earlier|cannot be (in the )?future|not be (in the )?future/.test(m)) add(fmt(dataset.dateOfService));
      else if (/future|after today|later|upcoming|cannot be (in the )?past/.test(m)) add(fmt(dataset.appointmentDate));
      add(fmt(own));
      add(fmt(dataset.today));
    }
    return out;
  }

  // A time that fits the field: within its min / max, on its step ("every 30 minutes").
  function fitTime(el, hhmm) {
    const toMin = (s) => { const t = String(s || '').match(/^(\d{1,2}):(\d{2})/); return t ? +t[1] * 60 + +t[2] : null; };
    const fmt = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    let t = toMin(hhmm);
    if (t == null) return hhmm;
    const lo = toMin(el.min);
    const hi = toMin(el.max);
    if (lo != null && t < lo) t = lo;
    if (hi != null && t > hi) t = hi;
    const stepMin = Number(el.step) > 0 ? Number(el.step) / 60 : 0;
    if (stepMin >= 1 && Number.isInteger(stepMin)) {
      const base = lo != null ? lo : 0;
      t = base + Math.round((t - base) / stepMin) * stepMin;
      if (hi != null && t > hi) t -= stepMin;
    }
    return fmt(t);
  }

  // Collapsed sections of a form: accordion headers (MUI, Angular Material, Bootstrap,
  // Ant, <details>) and generic section toggles (aria-expanded="false" + aria-controls).
  // Never dropdowns, menus, tabs or site navigation. Returns how many were opened.
  const SECTION_TOGGLE_SEL = [
    '.MuiAccordionSummary-root[aria-expanded="false"]',
    '.mat-expansion-panel-header[aria-expanded="false"]',
    '.accordion-button[aria-expanded="false"]',
    '[data-bs-toggle="collapse"][aria-expanded="false"]', '[data-toggle="collapse"][aria-expanded="false"]',
    '.ant-collapse-header[aria-expanded="false"]',
    'button[aria-expanded="false"][aria-controls]', '[role="button"][aria-expanded="false"][aria-controls]',
  ].join(', ');

  function isSectionToggle(t) {
    if (!isVisible(t) || isInNavRegion(t) || !inFillScope(t)) return false;
    if (t.matches('[role="combobox"], [aria-haspopup]:not([aria-haspopup="false"]), [role="tab"], [role="menuitem"]')) return false;
    if (t.closest('[role="menu"], [role="menubar"], [role="tablist"], [role="toolbar"], [role="listbox"], [role="dialog"] header, nav')) return false;
    // A generic toggle must control a region / panel, not a popup list.
    const id = t.getAttribute('aria-controls');
    const target = id && document.getElementById(id);
    if (target && target.matches('[role="listbox"], [role="menu"], [role="tree"], [role="grid"]')) return false;
    const text = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (DESTRUCTIVE_TOGGLE_RE.test(actionWords(text || t.getAttribute('aria-label') || ''))) return false;
    return text.length > 0 && text.length <= 80;
  }
  const DESTRUCTIVE_TOGGLE_RE = /^(cancel|delete|remove|discard|void|terminate|discharge|archive|deactivate|disable|close|sign\s?(out|off)|log\s?(out|off)|reset|clear|revoke|withdraw|reject|decline|deny|refund|unenroll|unsubscribe|end)\b/i;

  async function expandCollapsedSections() {
    const toggles = [];
    let opened = 0;
    for (const d of document.querySelectorAll('details:not([open])')) {
      if (isVisible(d) && !isInNavRegion(d) && inFillScope(d)) { d.open = true; opened++; }
    }
    for (const t of document.querySelectorAll(SECTION_TOGGLE_SEL)) {
      if (opened >= 30) break;
      if (!isSectionToggle(t)) continue;
      t.click();
      toggles.push(t);
      opened++;
    }
    if (opened) await waitForSectionsOpen(toggles);
    return toggles;
  }

  // The panel a section toggle opens.
  function sectionPanel(t) {
    const id = t.getAttribute('aria-controls');
    return (id && document.getElementById(id)) ||
      t.closest('.MuiAccordion-root, .mat-expansion-panel, .accordion-item, .ant-collapse-item') || t.parentElement;
  }

  // Let sections render their fields and finish their open animation (a CSS height
  // transition changes nothing in the DOM, so also wait for the panels' height to settle).
  async function waitForSectionsOpen(toggles) {
    await waitForQuiet(200, 2000);
    const panels = toggles.map(sectionPanel).filter(Boolean);
    const heights = () => panels.map((p) => Math.round(p.getBoundingClientRect().height)).join(',');
    let last = heights();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      await sleep(100);
      const now = heights();
      if (now === last) break;
      last = now;
    }
  }

  function waitForQuiet(quietMs, maxMs) {
    return new Promise((resolve) => {
      let timer = null;
      const done = () => { obs.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(); };
      const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, quietMs); });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(done, quietMs);
      const cap = setTimeout(done, maxMs);
    });
  }

  function isInNavRegion(el) {
    let n = el;
    let depth = 0;
    while (n && n.nodeType === 1 && depth < 12) {
      // The open dialog / drawer FillCraft works in is the form, whatever its class says
      // (PrimeReact's drawer is "p-sidebar"): nothing above it counts.
      if (fillScope && n === fillScope) return false;
      if (n.matches && n.matches(DIALOG_SEL)) return false;
      const tag = n.tagName;
      if (tag === 'NAV' || tag === 'HEADER') return true;
      const role = n.getAttribute && n.getAttribute('role');
      // NOTE: deliberately NOT treating role="menu"/"menuitem" as nav — those are
      // also used by legitimate dropdown popups (Chakra, headless menus).
      if (role === 'navigation' || role === 'banner') return true;
      const cls = (typeof n.className === 'string') ? n.className : '';
      if (cls && NAV_CLASS_RE.test(cls)) return true;
      n = n.parentElement;
      depth++;
    }
    return false;
  }

  // True if the element is, or sits inside, an anchor that navigates to a real
  // destination (i.e. not "#", not javascript:). Clicking such an element changes
  // the page/route, so we must never treat it as a dropdown trigger or option.
  function isNavigatingAnchor(el) {
    if (!el) return false;
    const a = (el.tagName === 'A') ? el : (el.closest ? el.closest('a[href]') : null);
    if (!a) return false;
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return false;
    return true;
  }

  // Phone widget = library wrapper that shows a flag/dial-code dropdown next to a tel input.
  // Common libraries: react-phone-input-2, react-phone-number-input, intl-tel-input, libphonenumber-js based.
  // (intl-tel-input names its parts "iti", "iti__selected-country", "iti__country-container"…)
  const PHONE_WIDGET_RE = /phone-input|tel-input|intl-tel|react-phone|phone-number-input|phone-field|phone-control|(^|\s)iti(\s|$)|iti--|iti__/;
  const PHONE_FLAG_RE   = /flag-dropdown|country-code|dial-code|country-selector|flag-button|country-list|selected-country|country-container|country-picker|iti__flag|iti__selected/;

  function isInsidePhoneWidget(el) {
    return !!ancestorClassMatches(el, PHONE_WIDGET_RE, 5);
  }

  // True for the flag / dial-code button inside a phone widget. Identified by:
  //   - class hint (flag-dropdown, country-code, dial-code, country-selector)
  //   - text content that looks like just a dial code ("+1", "1") or starts with a flag emoji
  //   - sits inside a phone widget AND has no useful label of its own
  function isPhoneFlagDropdown(el) {
    if (!el) return false;
    const cls = (typeof el.className === 'string') ? el.className.toLowerCase() : '';
    if (cls && PHONE_FLAG_RE.test(cls)) return true;
    if (ancestorClassMatches(el, PHONE_FLAG_RE, 3)) return true;
    const text = (el.textContent || '').trim();
    // Just a dial code "+1", "+44" (with its plus: a Year "2025" or Day "15" dropdown is not one;
    // a bare "1" inside a phone widget is caught below).
    if (/^\+\d{1,4}$/.test(text)) return true;
    if (/^[\u{1F1E6}-\u{1F1FF}]{2}/u.test(text)) return true; // starts with flag emoji
    // A small element inside a phone widget that isn't the input itself
    if (isInsidePhoneWidget(el) && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      const t = text.toLowerCase();
      // Anything that's not the actual phone number text
      if (text.length < 8 || /^[+\d\s()-]+$/.test(t) === false) return true;
    }
    return false;
  }

  // ---------- Your field settings (right-click → "Treat this field as…" / "Leave this field alone") ----------
  // This site's rules, given by the runner with each run (see fieldrules.js). With none — the
  // usual case — nothing below does anything.
  let fieldRules = [];
  let ruleSigCache = new WeakMap();
  let ambiguousRules = new Set();
  let ruleTarget = null; // "Fill this field": the right-clicked field, filled even if set to be left alone
  const LEAVE = '__leave';
  const RULES = () => globalThis.FillCraftRules;

  // What identifies a field for a rule: kind and tag, its own label (not text that only happens
  // to sit near it), name, stable id, test id and placeholder.
  function fieldSig(el) {
    const R = RULES();
    if (!R || !el || el.nodeType !== 1) return null;
    if (ruleSigCache.has(el)) return ruleSigCache.get(el);
    const formControl = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    let label = '';
    try {
      label = el.type === 'radio' ? groupLabel(el)
        : formControl ? (labelFromContext(el) ? '' : getLabelText(el))
        : dropdownLabelText(el);
    } catch (_) { label = ''; }
    const sig = {
      kind: formControl ? 'field' : 'dropdown',
      tag: el.tagName.toLowerCase(),
      label: R.normLabel(label),
      name: el.getAttribute('name') || el.getAttribute('formcontrolname') || '',
      id: R.stableId(el.id),
      testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
      placeholder: R.normLabel(el.getAttribute('placeholder') || ''),
    };
    ruleSigCache.set(el, sig);
    return sig;
  }

  // The rule for this field, if any (one that fits two fields on the page is not used).
  function ruleFor(el) {
    if (!fieldRules.length || !el) return null;
    const R = RULES();
    if (!R) return null;
    const r = fieldRules.find((x) => R.matches(fieldSig(el), x));
    if (!r || ambiguousRules.has(r.id)) return null;
    // ("Fill this field" on a field set to be left alone: the person asked for it.)
    if (r.type === 'leave' && ruleTarget && (el === ruleTarget || el.contains(ruleTarget) || ruleTarget.contains(el))) return null;
    return r;
  }
  function ambiguousRuleFor(el) {
    if (!ambiguousRules.size || !el) return null;
    const R = RULES();
    return (R && fieldRules.find((x) => ambiguousRules.has(x.id) && R.matches(fieldSig(el), x))) || null;
  }

  // For a result row: filled / left alone by your setting, or a setting that fits two fields.
  function ruleFlags(el) {
    const r = ruleFor(el);
    if (r) return r.type === 'leave' ? { rule: true, kind: '?leave' } : { rule: true };
    const a = ambiguousRuleFor(el);
    return a ? { ruleNote: `Your setting for “${a.label || 'this field'}” fits more than one field here, so it was not used` } : {};
  }

  // The website a field belongs to. (A frame made from the page's own HTML — srcdoc, about:blank —
  // says "null" for itself but is the page's own: its site is the page's.)
  function siteOrigin() {
    let o = '';
    try { o = location.origin; } catch (_) { o = ''; }
    if (!o || o === 'null') { try { o = window.origin; } catch (_) { /* keep */ } }
    if ((!o || o === 'null') && location.ancestorOrigins && location.ancestorOrigins.length) o = location.ancestorOrigins[0];
    return o || 'null';
  }

  // At the start of a run: this site's rules, and which of them fit more than one field here.
  function prepareRules(all) {
    ruleSigCache = new WeakMap();
    ambiguousRules = new Set();
    const origin = siteOrigin();
    fieldRules = all && typeof all === 'object' && Array.isArray(all[origin]) ? all[origin].filter((r) => r && r.sig && r.type) : [];
    const R = RULES();
    if (!fieldRules.length || !R) { fieldRules = R ? fieldRules : []; return; }
    const pool = new Set();
    try { collectFields({ onlyRequired: false }).forEach((f) => pool.add(f)); } catch (_) { /* best effort */ }
    try { collectCustomDropdowns().forEach((c) => pool.add(dropdownRoot(c))); } catch (_) { /* best effort */ }
    for (const r of fieldRules) {
      const hits = [];
      for (const f of pool) {
        if (!R.matches(fieldSig(f), r)) continue;
        // (Radios of one group, and a dropdown and its own inner box, are one field.)
        if (hits.some((h) => h === f || h.contains(f) || f.contains(h) || (f.type === 'radio' && h.type === 'radio' && f.name && f.name === h.name))) continue;
        hits.push(f);
      }
      if (hits.length > 1) ambiguousRules.add(r.id);
    }
  }

  // The field that was right-clicked (ctxmenu.js remembers the element), as a fill sees it.
  function rightClickedField() {
    const t = window.__fcCtxTarget;
    if (!t || !t.isConnected) return null;
    // A custom dropdown: the whole component, as a fill finds it.
    try {
      for (const d of discoverCustomDropdowns()) if (d.control === t || containsDeep(d.control, t)) return { el: d.control, kind: 'dropdown' };
    } catch (_) { /* a form control, below */ }
    const ctl = t.closest && t.closest('input:not([type=hidden]), select, textarea');
    if (ctl) return { el: ctl, kind: 'field' };
    const lab = t.closest && t.closest('label');
    if (lab && lab.control) return { el: lab.control, kind: 'field' };
    // Right-clicked beside the box (its label text, its wrapper): the one field in there.
    for (let n = t, i = 0; n && n !== document.body && i < 3; n = n.parentElement, i++) {
      const inside = Array.from(n.querySelectorAll(FIELD_SELECTOR)).filter(isVisible);
      if (inside.length === 1) return { el: inside[0], kind: 'field' };
      if (inside.length > 1) break;
    }
    return null;
  }

  // The section around a field: the nearest titled block (a fieldset, a card, a block that
  // starts with a heading or a short title) that holds at least one more field.
  function sectionOf(el) {
    const FIELDS = FIELD_SELECTOR + ', [role="combobox"], [aria-haspopup="listbox"]';
    const many = (n) => { let c = 0; for (const f of n.querySelectorAll(FIELDS)) { if (isVisible(f) && ++c > 1) return true; } return false; };
    const titled = (n) => {
      const first = n.firstElementChild;
      if (!first || first.matches(FIELDS) || first.querySelector(FIELDS)) return false;
      const t = (first.textContent || '').trim();
      return t.length >= 2 && t.length <= 60;
    };
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (!many(n)) continue;
      const cls = typeof n.className === 'string' ? n.className : '';
      if (n.matches('fieldset, section, [role="group"], [role="region"], [role="tabpanel"], form, dialog, [role="dialog"]') ||
          n.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > legend') ||
          titled(n) || /\b(section|card|panel|fieldset)\b/i.test(cls)) return n;
    }
    return el.closest('form') || fillScope || document.body;
  }

  // For the menu: the right-clicked field — how a rule would recognise it, and its name for
  // messages (its own label, else its name / placeholder). Never its value.
  function describeTarget() {
    ruleSigCache = new WeakMap();
    scopeToOpenDialog();
    const f = rightClickedField();
    if (!f) return { ok: false, reason: 'No field where you right-clicked — right-click inside the box of a field.' };
    if (f.kind === 'field' && /^(file|hidden|submit|button|reset|image)$/i.test(f.el.type || '')) return { ok: false, reason: 'FillCraft cannot be set for this kind of field.' };
    const sig = fieldSig(f.el);
    const R = RULES();
    if (!R || !R.recognisable(sig)) return { ok: false, reason: 'This field has no label, name or id FillCraft could recognise it by next time.' };
    let label = '';
    try { label = f.kind === 'dropdown' ? dropdownLabelText(f.el) : f.el.type === 'radio' ? groupLabel(f.el) : (labelFromContext(f.el) ? '' : getLabelText(f.el)); } catch (_) { label = ''; }
    label = tidy(String(label || f.el.getAttribute('name') || f.el.getAttribute('placeholder') || 'this field').replace(/\s*\*\s*$/, ''), 60);
    return { ok: true, sig, label, origin: siteOrigin(), path: location.pathname };
  }

  // Medicare / Medicaid IDs for a field set to them ("Treat this field as…") when the patient has
  // none of their own (not on Medicare / Medicaid).
  function makeMBI() {
    const L = 'ACDEFGHJKMNPQRTUVWXY', LD = L + '0123456789';
    const p = (s) => s[Math.floor(Math.random() * s.length)];
    const d = (a, b) => String(a + Math.floor(Math.random() * (b - a + 1)));
    return d(1, 9) + p(L) + p(LD) + d(0, 9) + p(L) + p(LD) + d(0, 9) + p(L) + p(L) + d(0, 9) + d(0, 9);
  }
  function makeMedicaidId() {
    const L = 'ACDEFGHJKMNPQRTUVWXY';
    let s = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)];
    for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function classify(el) {
    // Your setting for this field on this site comes first.
    const rule = ruleFor(el);
    if (rule) return rule.type === 'leave' ? LEAVE : rule.type;
    // Month / Day / Year dropdowns or boxes of a date of birth.
    if (el.tagName === 'SELECT' || ['text', 'tel', 'number', 'search', ''].includes((el.type || '').toLowerCase())) {
      const part = dobPartKey(el);
      if (part) return part;
    }
    const grp = splitPhoneGroup(el);
    if (grp && grp[0] !== el) { const k0 = classify(grp[0]); if (PHONE_KEYS.includes(k0)) return k0; }
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (ac && Object.prototype.hasOwnProperty.call(AUTOCOMPLETE_MAP, ac)) {
      // A label that names ANOTHER person (emergency contact, subscriber, proxy…) wins over
      // a generic autocomplete ("name", "tel"): that field is not the patient's own.
      const own = labelKeyOf(el);
      if (own && OTHER_PERSON_KEYS.has(own)) return own;
      // So does a confirmation box ("Confirm Password" marked new-password, "Confirm Email"
      // marked email) — and an email box marked "username" (the recommended login markup)
      // still takes an email address.
      if (own === 'passwordConfirm' || own === 'emailAlt') return own;
      const t = (el.type || '').toLowerCase();
      if (t === 'email' && AUTOCOMPLETE_MAP[ac] !== 'email') return own === 'emailAlt' ? own : 'email';
      return AUTOCOMPLETE_MAP[ac];
    }

    // Phone-widget heuristics — catch fields where the visible input has no useful name/id
    // because the country code dropdown sits next to it. The "+1" placeholder is the giveaway.
    // Its label still says WHOSE phone it is (the emergency contact's, a work phone…).
    const placeholder = (el.placeholder || '').trim();
    const phoneWidget = /^\+\d/.test(placeholder) ||
      (isInsidePhoneWidget(el) && ['tel', 'text', 'number', 'search', ''].includes((el.type || '').toLowerCase()));
    if (phoneWidget) {
      const own = labelKeyOf(el);
      return PHONE_KEYS.includes(own) ? own : 'phone';
    }

    // A radio's own label is an ANSWER ("Female", "Yes"); what the group asks is its
    // legend / radiogroup label ("Gender"), so classify radios by that.
    const key = resolveKey(el.type === 'radio' ? groupLabel(el) : getLabelText(el), [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('data-testid'),
      el.getAttribute('data-test'),
      el.getAttribute('data-field'),
    ]);
    const type = (el.type || '').toLowerCase();

    // A strongly-typed input overrides a conflicting text match
    // (e.g. type=email labelled "Username or email" must get an email address).
    if (type === 'email' && key !== 'email' && key !== 'emailAlt') return 'email';
    if (type === 'password' && key !== 'password' && key !== 'passwordConfirm') return 'password';
    // Card expiry is short (MM/YY); a full date field is a coverage end date, and a
    // short "Expiration" box is a card expiry.
    const fullDate = ['date', 'datetime-local'].includes(type) || /d{2}.*y{4}|y{4}.*d{2}/i.test(el.placeholder || '');
    if (key === 'ccExp' && fullDate) return 'terminationDate';
    if (key === 'terminationDate' && !fullDate && el.maxLength > 0 && el.maxLength <= 7) return 'ccExp';
    // A date / time box holds a date or time, whatever its id says ("apt" = appointment,
    // not an apartment).
    if (key && ['date', 'datetime-local', 'month', 'week'].includes(type) && !DATE_KEYS.includes(key) && key !== 'ccExp' && key !== 'appointmentTime') {
      return type === 'datetime-local' ? 'appointmentTime' : 'today';
    }
    if (key && type === 'time' && key !== 'appointmentTime') return 'appointmentTime';
    if (key) return key;

    // Boxes 2 and 3 of a split phone have no label of their own (the label sits before
    // box 1) — they inherit box 1's phone classification.
    const splitKey = splitPhoneSiblingKey(el);
    if (splitKey) return splitKey;

    if (type === 'email') return 'email';
    if (type === 'tel') return 'phone';
    if (type === 'url') return 'url';
    if (type === 'password') return 'password';
    // An unrecognised date input is NOT assumed to be a DOB (it gets today's date).
    // The same goes for a text box whose placeholder is a date format ("MM/DD/YYYY").
    if (fullDate) return 'today';
    if (type === 'number') return 'number';

    return null;
  }

  // What the field's own label / name says, before any widget or autocomplete hint.
  function labelKeyOf(el) {
    try {
      return resolveKey(el.type === 'radio' ? groupLabel(el) : getLabelText(el), [
        el.name, el.id, el.placeholder, el.getAttribute('data-testid'), el.getAttribute('data-test'), el.getAttribute('data-field'),
      ]);
    } catch (_) { return null; }
  }
  const OTHER_PERSON_KEYS = new Set(['emergencyName', 'emergencyFirstName', 'emergencyLastName', 'emergencyPhone', 'emergencyRelationship',
    'subscriberName', 'subscriberFirstName', 'subscriberLastName', 'subscriberDob', 'proxyName', 'relationshipToSubscriber']);

  // The boxes of a split phone that `el` belongs to — or null. The boxes are next to each
  // other (3/3/4 or 3/4 characters, in that order) with nothing but separators between them
  // ("(", ")", "-", spaces, screen-reader-only text): a "Last 4 of SSN" or "CVV" box elsewhere
  // in the form is not part of a phone.
  function splitPhoneGroup(el) {
    if (el.maxLength !== 3 && el.maxLength !== 4) return null;
    const scope = el.form || el.closest('form, [role="dialog"], dialog, fieldset') || document.body;
    const inputs = Array.from(scope.querySelectorAll('input')).filter((i) => i.type !== 'hidden');
    const at = inputs.indexOf(el);
    if (at < 0) return null;
    for (const shape of ['3/3/4', '3/4']) {
      const len = shape.split('/').length;
      for (let s = at - len + 1; s <= at; s++) {
        if (s < 0 || s + len > inputs.length) continue;
        const boxes = inputs.slice(s, s + len);
        if (boxes.map((b) => b.maxLength).join('/') !== shape) continue;
        if (boxes.every((b, k) => k === 0 || onlySeparatorsBetween(boxes[k - 1], b))) return boxes;
      }
    }
    return null;
  }

  function onlySeparatorsBetween(a, b) {
    if (!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    const r = document.createRange();
    r.setStartAfter(a);
    r.setEndBefore(b);
    const root = r.commonAncestorContainer;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let text = '';
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!r.intersectsNode(n)) continue;
      if (n.nodeType === 1) {
        if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName)) return false;
        continue;
      }
      const p = n.parentElement;
      if (p && p.getBoundingClientRect().width <= 2) continue; // screen-reader-only text
      text += n.nodeValue;
      if (text.length > 12) return false;
    }
    return /^[\s()\-‐-—.\/|·]*$/.test(text);
  }

  function splitPhoneSiblingKey(el) {
    const group = splitPhoneGroup(el);
    if (!group || group[0] === el) return null;
    const k = classify(group[0]);
    return PHONE_KEYS.includes(k) ? k : null;
  }

  // ---------- Element collection ----------
  function isVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.readOnly) return false;
    if (el.type === 'hidden') return false;
    // checkVisibility() (where supported) also accounts for ANCESTORS that are
    // display:none, visibility:hidden, opacity:0, or content-visibility:hidden —
    // something a self-only getComputedStyle check misses. Extra option keys are
    // harmless on browsers that don't recognize them.
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({
        checkOpacity: true, checkVisibilityCSS: true,
        // (Not contentVisibilityAuto: that would hide fields in off-screen
        // content-visibility:auto sections of long forms, which are real fields.)
        opacityProperty: true, visibilityProperty: true,
      })) return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  const LIBRARY_DROPDOWN_SELECTOR = '.react-select__control, [class*="-select__control"], .MuiAutocomplete-root, .ant-select, .select2-container, .choices__inner';

  // Is this <input> the search box of a dropdown component (so typing into it selects
  // nothing)? Recognises React-Select even without a classNamePrefix (auto-generated
  // "css-…-control" classes, id "react-select-N-input") and BEM-style "…__control"
  // wrappers — while a plain autocomplete text input (e.g. an address search) is kept.
  function isLibraryDropdownInput(el) {
    if (el.closest(LIBRARY_DROPDOWN_SELECTOR)) return true;
    // Mantine's Select: what is typed only searches its list (it empties itself on leaving).
    // (Its Autocomplete, a free-text box, is not one.)
    if (el.matches('input.mantine-Select-input')) return true;
    if (isComboboxDropdownInput(el)) return true;
    if (/^react-select-\d+-input$/.test(el.id || '')) return true;
    if (el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('role') === 'combobox') {
      const ctrl = el.closest('[class*="__control"], [class*="-control"]');
      if (ctrl && ctrl.querySelector('[class*="indicator" i], [class*="__value-container"], [class*="ValueContainer"]')) return true;
    }
    return false;
  }

  // Widgets that pick from a list and draw their own search box (Tom Select, Element Plus,
  // Vuetify, Selectize, Chosen, Slim Select, PrimeReact, Kendo).
  const DROPDOWN_WIDGET_ROOT_SEL = '.ts-wrapper, .el-select, .v-select, .v-autocomplete, .v-field[role="combobox"], .selectize-control, .chosen-container, .ss-main, .p-dropdown, .p-multiselect, .k-dropdown';
  // Free-text comboboxes: whatever is typed is the value (the list only suggests), so they
  // are filled as text fields, as before. (One that refuses typed text and empties itself
  // is then handled as a dropdown — see discoverCustomDropdowns.)
  const FREE_TEXT_COMBOBOX_SEL = '.v-combobox, .p-autocomplete, .k-combobox';
  // A combobox box that is really a dropdown: inside such a widget, read-only / "no
  // typing" (a select drawn as a box), or with its own list button next to it (Headless
  // UI, React Aria, Downshift). A plain search-as-you-type box (an address lookup) is not.
  function isComboboxDropdownInput(el) {
    if (el.closest(FREE_TEXT_COMBOBOX_SEL)) return false;
    if (el.closest(DROPDOWN_WIDGET_ROOT_SEL)) return true;
    if ((el.getAttribute('role') || '') !== 'combobox') return false;
    if (el.readOnly || (el.getAttribute('aria-autocomplete') || '') === 'none') return true;
    return !!listButtonBeside(el);
  }
  // The list button paired with a combobox input: right beside it (same parent), and
  // either tied to it (same aria-controls, or a label part only these two share) or alone
  // with it in a small box. A button of another field in the same row / grid is not its
  // button — nor is one that only shares a group heading with it.
  function listButtonBeside(input) {
    const box = input.parentElement;
    if (!box || box === document.body) return null;
    const ids = (s) => String(s || '').split(/\s+/).filter(Boolean);
    const inControls = input.getAttribute('aria-controls');
    const inLabels = ids(input.getAttribute('aria-labelledby'));
    const kids = Array.from(box.children);
    const otherFields = kids.filter((c) => c !== input && c.matches('input:not([type="hidden"]), select, textarea, [role="combobox"]'));
    for (const b of kids) {
      if (b === input || !b.matches('button[aria-haspopup="listbox"], [role="button"][aria-haspopup="listbox"]')) continue;
      const bControls = b.getAttribute('aria-controls');
      const sharesOwnLabel = ids(b.getAttribute('aria-labelledby')).some((x) => inLabels.includes(x) &&
        document.querySelectorAll(`[aria-labelledby~="${cssEscape(x)}"]`).length <= 2);
      if ((inControls && bControls && inControls === bControls) || sharesOwnLabel || !otherFields.length) return b;
    }
    return null;
  }
  // The combobox input a list button belongs to (see listButtonBeside), or null.
  function comboboxOfButton(btn) {
    const box = btn.parentElement;
    if (!box || box === document.body) return null;
    return Array.from(box.children).find((c) => c.matches('input[role="combobox"]') && listButtonBeside(c) === btn) || null;
  }
  // The dropdown made of a search box + its list button: their own small box — or, when
  // that box also holds other fields (a flat grid), the search box alone.
  function pairRoot(input) {
    const box = input.parentElement;
    const others = Array.from(box.children).filter((c) => c !== input && c.matches('input:not([type="hidden"]), select, textarea, [role="combobox"]'));
    return others.length ? input : box;
  }
  // The original <select> a widget keeps hidden behind its own box (Select2, Tom Select,
  // Selectize, bootstrap-select): the widget is what gets filled. A 1-pixel select is one
  // no person can use either.
  function isWidgetBackingSelect(el) {
    if (/(^|\s)(select2-hidden-accessible|ts-hidden-accessible|tomselected|selectized|bs-select-hidden|choices__input)(\s|$)/.test(typeof el.className === 'string' ? el.className : '')) return true;
    const r = el.getBoundingClientRect();
    return r.width <= 2 && r.height <= 2;
  }
  // The <select> a Select2 / Tom Select / Selectize / Chosen box replaced: just before the
  // box (an error message a validator put in between is skipped), or null.
  function backingSelectOf(el) {
    const widget = el.closest && el.closest('.select2-container, .ts-wrapper, .selectize-control, .chosen-container');
    if (!widget) return null;
    for (let p = widget.previousElementSibling, i = 0; p && i < 3; p = p.previousElementSibling, i++) {
      if (p.tagName === 'SELECT') return isWidgetBackingSelect(p) ? p : null;
    }
    return null;
  }

  function isCodeEditorInput(el) {
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return false;
    if (el.classList.contains('inputarea') || el.classList.contains('ace_text-input')) return true;
    return !!el.closest('.CodeMirror, .cm-editor, .monaco-editor, .ace_editor, [class*="code-editor" i], [class*="CodeEditor"], [class*="codeEditor"], .prism-live, [data-code-editor]');
  }

  // A "honeypot": a field hidden from people so that only bots fill it — placed off the
  // page, hidden from assistive tech and out of the tab order, or named as a trap.
  function isHoneypot(el) {
    const r = el.getBoundingClientRect();
    // Off the page = left of / above everything that can be scrolled to — or right of /
    // below it. A field scrolled out of view inside a scrolling box (a long dialog) is
    // still on the page.
    let sx = scrollX, sy = scrollY;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      sx += p.scrollLeft; sy += p.scrollTop;
    }
    if (r.right + sx <= 0 || r.bottom + sy <= 0) return true;
    const doc = document.documentElement;
    // (A page that does not scroll sideways ends at the window's edge.)
    const noScroll = (axis) => [doc, document.body].some((n) => n && /hidden|clip/.test(getComputedStyle(n)[axis]));
    const pageW = noScroll('overflowX') ? doc.clientWidth : Math.max(doc.scrollWidth, doc.clientWidth);
    const pageH = noScroll('overflowY') ? doc.clientHeight : Math.max(doc.scrollHeight, doc.clientHeight, document.body ? document.body.scrollHeight : 0);
    // (Not inside something that scrolls on its own — a dialog, a panel — or is fixed on
    // screen: the page may not scroll while that box does.)
    const scrollsWithin = (axis) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === 'fixed' || /auto|scroll|overlay/.test(axis === 'x' ? cs.overflowX : cs.overflowY)) return true;
      }
      return false;
    };
    if (r.width && ((r.left + sx >= pageW && !scrollsWithin('x')) || (r.top + sy >= pageH && !scrollsWithin('y')))) return true;
    // Thousands of pixels to the right of the page: nobody scrolls there to type.
    if (r.left + sx > Math.max(3 * innerWidth, 4000) && !scrollsWithin('x')) return true;
    if (el.tabIndex === -1 && el.closest('[aria-hidden="true"]') && !el.closest('[role="combobox"], [class*="select" i], [class*="Select"]')) return true;
    // A form that names its trap field (Netlify: netlify-honeypot="bot-field").
    const trapName = el.form && (el.form.getAttribute('netlify-honeypot') || el.form.getAttribute('data-netlify-honeypot'));
    if (trapName && el.name === trapName) return true;
    const name = String(el.name || '').toLowerCase();
    const id = String(el.id || '').toLowerCase();
    const TRAP_NAME = /^(hp|hpot|honey[_-]?pot|bot[_-]?field|bot[_-]?trap|bot[_-]?check|website[_-]?url[_-]?hp|fax[_-]?only|a[_-]?password)$/;
    if (TRAP_NAME.test(name) || TRAP_NAME.test(id)) return true;
    if (/(^|\s)(honey[-_]?pot|hpot|hp[-_]?(field|trap)|ohnohoney)(\s|$)/i.test(typeof el.className === 'string' ? el.className : '')) return true;
    // Told to people in words: "Leave this field blank", "Don't fill this out if you're human".
    const said = [el.getAttribute('aria-label'), el.placeholder, getLabelText(el), el.title].filter(Boolean).join(' ').toLowerCase();
    // (Not an instruction with a condition: "Leave blank to keep the current password", "Leave
    // empty for default", "Do not fill if same as above" are ordinary fields.)
    if (/leave\s+(this\s+)?(field\s+|box\s+|input\s+)?(empty|blank)(?!\s+(if|unless|to|for|when|except)\b)|do\s*n[o']t\s+fill(\s+(this|it|in))?(\s+(out|in|field))?(?!\s+(if|unless|when|for|to)\b(?!\s+you('re|\s+are)\s+(a\s+)?human))|if\s+you('re|\s+are)\s+(a\s+)?human|for\s+(bots|robots|spam\s*bots)\s+only|anti[\s-]*spam\s+field/.test(said)) return true;
    // Text boxes a person cannot see: 2 px or less, clipped away, or behind the page.
    const type = (el.type || '').toLowerCase();
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(type))) {
      if ((r.width > 0 && r.width <= 2) || (r.height > 0 && r.height <= 2)) return true;
      for (let p = el, i = 0; p && p !== document.body && i < 6; p = p.parentElement, i++) {
        const cs = getComputedStyle(p);
        if (/inset\(\s*50%|circle\(\s*0|polygon\(\s*0/.test(cs.clipPath || '') || /rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(cs.clip || '')) return true;
        if (p !== el && cs.overflow !== 'visible' && (p.getBoundingClientRect().height < 2 || p.getBoundingClientRect().width < 2)) return true;
        if (Number(cs.zIndex) < 0 && cs.position !== 'static') {
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
            const top = document.elementFromPoint(cx, cy);
            if (top && top !== el && !el.contains(top) && !(el.labels && Array.from(el.labels).some((l) => l.contains(top)))) return true;
          }
        }
      }
    }
    return false;
  }

  // Inside a cookie / privacy-consent banner (OneTrust, Cookiebot, "cookie-banner"…).
  function inConsentBanner(el) {
    for (let n = el.parentElement, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
      if (CONSENT_RE.test([n.id, typeof n.className === 'string' ? n.className : '', n.getAttribute('aria-label') || ''].join(' '))) return true;
    }
    return false;
  }

  // Robot checks (CAPTCHA): a question only a real person may answer.
  // ("Complete the security check" is one; "Background security check completed?" is a question.)
  const CAPTCHA_LABEL_RE = /not\s+a\s+robot|captcha|are\s+you\s+(a\s+)?human|verify\s+(that\s+)?you('re|\s+are)\s+(a\s+)?human|human\s+verification|(complete|pass|solve)\s+(the\s+|this\s+)?security\s+check|characters?\s+(shown|in\s+the\s+(image|picture)|you\s+see|displayed)|type\s+the\s+(text|characters|letters|word|code)\s+(shown|in|you\s+see|from)|what\s+is\s+\d+\s*[+x×*\-−]\s*\d+|solve\s+(this|the)\s+(math|sum|problem)|anti[\s-]*spam\s+question/i;
  function isCaptchaField(el) {
    return !!el.closest('.g-recaptcha, .h-captcha, .cf-turnstile, [class*="captcha" i], [id*="captcha" i]') ||
      CAPTCHA_LABEL_RE.test(getLabelText(el) + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || ''));
  }

  // A one-time / verification code: only the person who received it knows it.
  function isOneTimeCode(el) {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    // A box for typing a code — not a checkbox that mentions codes ("I agree to receive
    // one-time passcodes…"), and not a payment card's security code (CVV).
    const type = (el.type || '').toLowerCase();
    if (el.tagName === 'SELECT' || ['checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(type)) return false;
    const label = (getLabelText(el) + ' ' + (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '')).toLowerCase();
    if (/^cc-/.test(ac) || /\b(card|cvv|cvc|csc|cvn|credit|debit)\b/.test(label)) return false;
    // A bare "Security Code" next to a card number is the card's CVV.
    if (/security\s*code/.test(label) && el.form && el.form.querySelector('input[autocomplete="cc-number"], input[name*="card" i], input[id*="card" i]')) return false;
    // ("Authorization Code" / "Prior Authorization Code" is a health plan's approval number —
    // a code you are given, not one sent to you; "Authentication code" is a sign-in code.)
    if (/verification\s*code|one[\s-]*time\s*(pass)?(code|word|pin|password)|\botp\b|passcode|\b(2fa|mfa|two[\s-]*factor|2[\s-]*step)\b|security\s*code|auth(entication)?\s*code|confirmation\s*code|code\s+(that\s+)?(we|was)?\s*(sent|texted|e-?mailed)|code\s+from\s+the\s+(e-?mail|sms|text|app)|\b(sms|text|e-?mail)(ed)?\s+code|enter\s+(the\s+)?(\d+[\s-]*digit\s+)?code\b|\b\d[\s-]*digit\s+code/.test(label)) return true;
    // autocomplete="one-time-code" — unless the form only uses it to keep the browser's own
    // autofill away (some apps put it on every box: First Name, SSN, their dropdowns…).
    if (ac === 'one-time-code' && !(namedOtherwise(el) || autofillBlockerForm(el))) return true;
    // A row of 4–8 single-character boxes (each maybe in a wrapper of its own).
    if (el.maxLength === 1 && el.parentElement) {
      for (const box of [el.parentElement, el.parentElement.parentElement]) {
        if (!box) continue;
        const n = box.querySelectorAll('input[maxlength="1"]').length;
        if (n >= 4 && n <= 8) return true;
      }
    }
    return false;
  }
  // A box whose own name says what else it is: a dropdown's or calendar's box, an email /
  // web address / date box, or a label FillCraft knows (First Name, SSN, Phone…).
  const CODE_LIKE_KEYS = new Set(['password', 'passwordConfirm', 'ccCvv', 'number']);
  function namedOtherwise(box) {
    if (['email', 'url', 'search', 'date', 'datetime-local', 'month', 'week', 'time'].includes((box.type || '').toLowerCase())) return true;
    if ((box.getAttribute('aria-haspopup') || 'false') !== 'false' || /^(list|both)$/i.test(box.getAttribute('aria-autocomplete') || '') ||
        box.closest('[role="combobox"], [aria-haspopup="listbox"]')) return true;
    // Words about a code ("We sent a code to your phone", "PIN", "6 digits") name a code box,
    // whatever else they mention.
    const words = [getLabelText(box), box.name, box.id, box.placeholder, box.getAttribute('aria-label')].join(' ');
    if (/\b(code|pin|otp|token|passcode|digits?)\b/i.test(words)) return false;
    const key = labelKeyOf(box);
    return !!key && !CODE_LIKE_KEYS.has(key);
  }
  // A form that puts autocomplete="one-time-code" on boxes that are plainly something else
  // (two or more): there the attribute only keeps the browser's autofill away.
  function autofillBlockerForm(el) {
    const scope = el.form || el.closest('form, [role="dialog"], dialog') || document;
    let named = 0;
    for (const b of scope.querySelectorAll('input[autocomplete="one-time-code" i], textarea[autocomplete="one-time-code" i]')) {
      if (namedOtherwise(b) && ++named >= 2) return true;
    }
    return false;
  }

  // Shadow roots on the page: open ones, and closed ones on custom elements (the
  // extension API can reach those; page scripts cannot).
  function shadowRoots() {
    const out = [];
    const closedApi = typeof chrome !== 'undefined' && chrome.dom && typeof chrome.dom.openOrClosedShadowRoot === 'function';
    const walk = (node, depth) => {
      if (depth > 5) return;
      for (const el of node.querySelectorAll('*')) {
        let r = el.shadowRoot;
        if (!r && closedApi && el.localName.includes('-')) { try { r = chrome.dom.openOrClosedShadowRoot(el); } catch (_) { r = null; } }
        if (r) { out.push(r); walk(r, depth + 1); }
      }
    };
    try { walk(document, 0); } catch (_) { /* never let this stop a fill */ }
    return out;
  }

  // ---------- Open dialogs: work only where the person is working ----------
  // While a modal dialog or drawer is open, a person can only use that dialog: the page
  // behind it is covered by a backdrop, hidden (aria-hidden / inert) or made inert by the
  // browser (<dialog> opened with showModal()). Fill, Clear and Detect then work inside
  // the dialog only. A dialog that does not block the page (a cookie bar, a date-picker
  // popup, a chat panel) changes nothing.
  let fillScope = null;

  const DIALOG_SEL = [
    'dialog[open]', '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
    '.modal.show', '.modal.in', '.modal.is-active', '.offcanvas.show', '.MuiDialog-paper', '.MuiDrawer-paper',
    '.ant-modal', '.ant-drawer-content-wrapper', 'mat-dialog-container', '.mat-mdc-dialog-container', '.mat-dialog-container',
    '.ReactModal__Content', '.chakra-modal__content', '.el-dialog', '.el-drawer', '.v-dialog', '.p-dialog', '.p-sidebar',
    '.k-window', '.swal2-popup', '.slds-modal__container', '.ui.modal.visible',
  ].join(', ');
  // Layers that belong to an open dropdown or picker (their "click outside" catcher).
  const TRANSPARENT_BACKDROP_SEL = '.cdk-overlay-transparent-backdrop, .MuiBackdrop-invisible, .MuiPopover-root > .MuiBackdrop-root[style*="opacity: 0"], .ant-select-dropdown ~ .ant-dropdown-mask';
  const DROPDOWN_LAYER_SEL = TRANSPARENT_BACKDROP_SEL + ', [role="listbox"], [role="menu"], [role="tooltip"], .MuiPopover-root, .MuiPopper-root, .cdk-overlay-pane:not(:has(mat-dialog-container, .mat-mdc-dialog-container)), .ant-select-dropdown, .ant-picker-dropdown';
  // Cookie banners (never "consent to treatment" and other consent forms).
  const CONSENT_RE = /cookie|gdpr|ccpa|onetrust|cybot|truste-|trustarc|osano|didomi|usercentrics|termly|iubenda|\bcmp\b|privacy[-_\s]?(banner|center|centre|preferences?)/i;
  const FIELDISH_SEL = 'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]), select, textarea, [contenteditable="true"], [contenteditable=""], [role="combobox"], [role="radio"], [role="checkbox"], [role="switch"], [role="textbox"], [role="slider"], [role="spinbutton"], [aria-haspopup="listbox"]';

  // The parent across shadow-DOM boundaries, and "contains" that looks through them.
  const composedParent = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  function containsDeep(root, el) {
    for (let n = el; n; ) {
      if (root === n || root.contains(n)) return true;
      const r = n.getRootNode ? n.getRootNode() : null;
      n = r && r.host ? r.host : null;
    }
    return false;
  }
  function inFillScope(el) {
    return !fillScope || (!!el && containsDeep(fillScope, el));
  }

  // The element at a point on the screen, looking inside open shadow roots.
  function hitAt(x, y) {
    let el = document.elementFromPoint(x, y);
    // (Closed shadow roots too: the extension API can reach them.)
    const rootOf = (n) => {
      if (n.shadowRoot) return n.shadowRoot;
      if (n.localName && n.localName.includes('-') && typeof chrome !== 'undefined' && chrome.dom && chrome.dom.openOrClosedShadowRoot) {
        try { return chrome.dom.openOrClosedShadowRoot(n); } catch (_) { return null; }
      }
      return null;
    };
    for (let i = 0; el && i < 6; i++) {
      const root = rootOf(el);
      if (!root) break;
      const inner = root.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  // On the page with a size (opacity does not matter: styled checkboxes hide their input).
  function isPresent(el) {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  const viewW = () => document.documentElement.clientWidth || innerWidth;
  const viewH = () => document.documentElement.clientHeight || innerHeight;
  function coversViewport(el) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, viewW()) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, viewH()) - Math.max(r.top, 0);
    return w >= viewW() * 0.85 && h >= viewH() * 0.85;
  }
  // The nearest element at or above n that covers the screen as a layer of its own:
  // a backdrop, an overlay, or an app shell (position fixed / absolute).
  function coveringLayer(n) {
    for (let i = 0; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement && i < 30; i++, n = composedParent(n)) {
      const pos = getComputedStyle(n).position;
      if ((pos === 'fixed' || pos === 'absolute') && coversViewport(n)) return n;
    }
    return null;
  }
  function hasFixedLayer(n) {
    for (let i = 0; n && n.nodeType === 1 && n !== document.body && i < 30; i++, n = composedParent(n)) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  }
  // Points spread over the screen (5 x 5).
  function screenPoints() {
    const out = [];
    for (const fy of [0.04, 0.27, 0.5, 0.73, 0.96]) for (const fx of [0.04, 0.27, 0.5, 0.73, 0.96]) out.push([viewW() * fx, viewH() * fy]);
    return out;
  }
  function presentFields() {
    const all = Array.from(document.querySelectorAll(FIELDISH_SEL));
    for (const root of shadowRoots()) all.push(...root.querySelectorAll(FIELDISH_SEL));
    return all.filter(isPresent);
  }
  const hiddenBehind = (f) => !!f.closest('[aria-hidden="true"], [inert]');

  // Is el the thing in front at its own centre (part of it that is on screen)?
  function inFront(el) {
    const r = el.getBoundingClientRect();
    const x = (Math.max(r.left, 0) + Math.min(r.right, viewW())) / 2;
    const y = (Math.max(r.top, 0) + Math.min(r.bottom, viewH())) / 2;
    if (x <= 0 || y <= 0 || x >= viewW() || y >= viewH()) return false;
    const hit = hitAt(x, y);
    return !!hit && (containsDeep(el, hit) || !!hit.closest?.(DROPDOWN_LAYER_SEL));
  }

  // Does dialog c block the page behind it?
  function blocksPage(c, fields) {
    try { if (c.matches('dialog:modal') || c.closest('dialog:modal')) return true; } catch (_) { /* older browser */ }
    const outside = fields.filter((f) => !containsDeep(c, f));
    // The page behind is hidden from assistive technology / made inert (MUI, React-Modal,
    // Radix, Headless UI, Chakra and others do this for modal dialogs).
    if (outside.length && !hiddenBehind(c) && outside.filter(hiddenBehind).length >= outside.length * 0.5) return true;
    // A backdrop / overlay covers the page around the dialog.
    const r = c.getBoundingClientRect();
    let points = 0, covered = 0;
    for (const [x, y] of screenPoints()) {
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) continue;
      const hit = hitAt(x, y);
      if (!hit || hit.closest?.(DROPDOWN_LAYER_SEL)) continue;
      points++;
      const layer = containsDeep(c, hit) ? null : coveringLayer(hit);
      if (layer && !outside.some((f) => containsDeep(layer, f))) covered++;
    }
    if (points >= 3) return covered >= points * 0.6;
    // The dialog fills the screen itself (a full-screen dialog or drawer).
    return coversViewport(c) && hasFixedLayer(c);
  }

  function dialogName(c) {
    const by = (c.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    const head = c.querySelector('h1, h2, h3, h4, [class*="title" i], [class*="header" i]');
    return tidy(c.getAttribute('aria-label') || by || (head && head.textContent) || '', 50);
  }

  // A plain overlay without ARIA: a layer covering the screen, and the box in front of it.
  function findOverlayDialog(fields) {
    const counts = new Map();
    let points = 0;
    const others = [];
    for (const [x, y] of screenPoints()) {
      const hit = hitAt(x, y);
      if (!hit || hit.closest?.(DROPDOWN_LAYER_SEL)) continue;
      points++;
      const layer = coveringLayer(hit);
      if (layer) counts.set(layer, (counts.get(layer) || 0) + 1);
      else others.push(hit);
    }
    let overlay = null, best = 0;
    for (const [l, n] of counts) if (n > best) { overlay = l; best = n; }
    // (The box itself can take most of a small screen, so only a share of the points need
    // to land on the layer; what decides is whether the page behind is covered — below.)
    if (!overlay || best < 3 || best < points * 0.3) return null;
    // A box counts when it holds fields — or a frame (a form loaded in an <iframe>: a
    // Thickbox-style popup, a full-screen booking / survey widget).
    const holds = (n) => fields.some((f) => containsDeep(n, f)) || /^(IFRAME|FRAME)$/.test(n.tagName) || !!n.querySelector('iframe, frame');
    let box = null;
    if (holds(overlay)) {
      box = overlay; // the overlay holds the dialog box itself
    } else {
      // An empty backdrop: the dialog is the positioned box in front of it.
      for (const hit of others) {
        for (let n = hit, i = 0; n && n.nodeType === 1 && n !== document.body && i < 30; i++, n = composedParent(n)) {
          const pos = getComputedStyle(n).position;
          if (pos === 'fixed' || pos === 'absolute') { if (holds(n)) box = n; break; }
        }
        if (box) break;
      }
    }
    if (!box || CONSENT_RE.test([box.id, typeof box.className === 'string' ? box.className : ''].join(' '))) return null;
    // Something must lie behind it (else the layer is the page itself, e.g. an app shell),
    // and whatever of that is on screen must really be covered.
    const behind = fields.filter((f) => !containsDeep(box, f) && !isInNavRegion(f));
    if (!behind.length) return null;
    const onScreen = behind.filter((f) => { const r = f.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < viewH() && r.left < viewW(); });
    const reachable = onScreen.filter((f) => {
      const r = f.getBoundingClientRect();
      const hit = hitAt(Math.min(Math.max(r.left + r.width / 2, 1), viewW() - 1), Math.min(Math.max(r.top + r.height / 2, 1), viewH() - 1));
      return hit && (containsDeep(f, hit) || containsDeep(hit, f) || (f.labels && Array.from(f.labels).some((l) => containsDeep(l, hit))));
    });
    if (onScreen.length && reachable.length === onScreen.length) return null;
    return box;
  }

  // The dialog in front of the page, or null. { el, name, empty }
  function findOpenDialog() {
    const cands = [];
    const add = (list) => { for (const c of list) if (!cands.includes(c)) cands.push(c); };
    add(document.querySelectorAll(DIALOG_SEL));
    for (const root of shadowRoots()) add(root.querySelectorAll(DIALOG_SEL));
    let fields = null;
    const open = [];
    for (const c of cands) {
      if (!isPresent(c) || hiddenBehind(c)) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      if (c.matches('[role="listbox"], [role="menu"], [role="tooltip"]') || c.closest(DROPDOWN_LAYER_SEL)) continue;
      const name = [c.id, typeof c.className === 'string' ? c.className : '', c.getAttribute('aria-label') || '', c.getAttribute('aria-labelledby') ? dialogName(c) : ''].join(' ');
      if (CONSENT_RE.test(name)) continue;
      if (!inFront(c)) continue;
      fields = fields || presentFields();
      if (!blocksPage(c, fields)) continue;
      open.push(c);
    }
    // A dialog inside another dialog's markup is the one in front; otherwise the last one.
    const inner = open.filter((c) => !open.some((o) => o !== c && containsDeep(c, o)));
    let el = inner[inner.length - 1] || null;
    if (!el) el = findOverlayDialog(fields || presentFields());
    if (!el) return null;
    const hasFrame = /^(IFRAME|FRAME)$/.test(el.tagName) || !!el.querySelector('iframe, frame');
    return { el, name: dialogName(el), empty: !hasFrame && !(fields || presentFields()).some((f) => containsDeep(el, f)) };
  }

  // Sets the scope for one Fill / Clear / Detect. Returns what the popup should know.
  function scopeToOpenDialog() {
    let d = null;
    try { d = findOpenDialog(); } catch (err) { console.warn('[FillCraft] Could not check for an open dialog:', err); }
    fillScope = d ? d.el : null;
    return d ? { name: d.name, empty: d.empty } : null;
  }

  // For the runner: is a dialog open in this page, and which frames are inside it?
  function dialogFrames(nonce) {
    let d = null;
    try { d = findOpenDialog(); } catch (_) { d = null; }
    if (!d) return { open: false };
    // A temporary mark: each frame checks whether its <iframe> sits inside it (removed again
    // by unmarkDialog as soon as the run is over).
    if (nonce) { unmarkDialog(); d.el.setAttribute('data-fillcraft-dialog', String(nonce)); }
    const url = (f) => { try { return new URL(f.src || 'about:blank', location.href).href.split('#')[0]; } catch (_) { return f.src || ''; } };
    const frames = Array.from(document.querySelectorAll('iframe, frame'));
    for (const root of shadowRoots()) frames.push(...root.querySelectorAll('iframe, frame'));
    return {
      open: true,
      inside: frames.filter((f) => containsDeep(d.el, f)).map(url),
      outside: frames.filter((f) => !containsDeep(d.el, f)).map(url),
    };
  }

  function unmarkDialog() {
    document.querySelectorAll('[data-fillcraft-dialog]').forEach((n) => n.removeAttribute('data-fillcraft-dialog'));
    return true;
  }

  // ---------- Never submit, reset or close anything ----------
  // FillCraft only fills fields. While it works, a form submit or reset is cancelled, and a
  // click that is not the person's own (sent by FillCraft, or by the page in reaction to
  // it) is stopped when it would land on a Save / Submit / Cancel / Close / Next button, a
  // dialog's close "×", a dialog's backdrop, or a link to another page. The person's own
  // clicks and keys (trusted events) are never touched.
  const PICKER_POPUP_SEL = '.ant-picker-dropdown, .MuiPickersPopper-root, .MuiPickersLayout-root, .MuiDateCalendar-root, .flatpickr-calendar, .react-datepicker, .daterangepicker, .el-picker-panel, .mat-datepicker-content, .p-datepicker, .air-datepicker, .datepicker-dropdown, .ui-datepicker, [data-dates-dropdown], .mantine-Calendar-calendar';
  const DISMISS_SEL = '[data-dismiss], [data-bs-dismiss], [mat-dialog-close], [data-close], [data-modal-close], [data-micromodal-close], .btn-close, .close, .modal-close, .ant-modal-close, .ant-drawer-close, .swal2-close, .swal2-cancel, .swal2-confirm, .el-dialog__headerbtn, .el-drawer__close-btn, .p-dialog-header-close, .k-window-action, [aria-label="close" i], [aria-label^="close " i], [aria-label^="dismiss" i], [aria-label^="cancel" i], [title="close" i], [title^="close " i]';
  const DIALOG_BACKDROP_SEL = '.modal-backdrop, .modal, .MuiBackdrop-root, .MuiDialog-container, .MuiModal-root, .ant-modal-mask, .ant-modal-wrap, .ant-drawer-mask, .cdk-overlay-backdrop, .ReactModal__Overlay, .swal2-container, .v-overlay__scrim, .el-overlay, .p-dialog-mask, .offcanvas-backdrop, .chakra-modal__overlay, .chakra-modal__content-container, dialog';
  const ACTION_BUTTON_SEL = 'button, a[href], [role="button"], [role="menuitem"], input[type="submit"], input[type="reset"], input[type="image"], input[type="button"]';
  const NOT_AN_ACTION_SEL = '[aria-expanded], [aria-haspopup]:not([aria-haspopup="false"]), [role="tab"], [role="combobox"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [aria-pressed], .MuiToggleButton-root, .mat-button-toggle-button';
  const CLOSE_MARK_RE = /^[x×✕✖✗]$/i;
  const ACTION_TEXT_RE = /^(?:close|cancel|dismiss|discard|abort|exit|quit|back|go back|previous|prev|next|continue|proceed|skip|finish|done|complete|submit|resubmit|send|save|update|apply|confirm|create|register|sign\s?(?:in|up|out|off)|log\s?(?:in|out|off)|delete|remove|reset|clear|pay|checkout|check out|place order|order|book|ok|okay|approve|reject|decline|deny|accept|publish|unpublish|post|archive|unarchive|void|refund|charge|print|export|share|invite|assign|reassign|transfer|merge|lock|unlock|activate|deactivate|terminate|discharge|admit|authorize|finalize|finalise|sign|e-?sign|release|request|schedule|reschedule|start|begin|end|stop)(?:\s+[\w&'’.-]+){0,8}$/i;
  // The words of a button, without the arrows, check marks and emoji around or between them.
  const actionWords = (t) => String(t || '').replace(/[^\p{L}\p{N}&'’\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  // A button made as a web component (<sl-button>, <md-filled-button>, <ion-button>…): a
  // click lands inside its shadow DOM (or on the element itself), while its text, "type"
  // and "href" belong to the element.
  function componentButton(t) {
    let n = t;
    for (let i = 0; n && i < 8; i++) {
      if (n.nodeType === 1 && n.localName.includes('-') &&
          (/button|btn|link|fab|action/.test(n.localName) || n.getAttribute('role') === 'button' || n.hasAttribute('href') || /^(submit|reset)$/i.test(n.getAttribute('type') || ''))) return n;
      const root = n.parentNode ? null : n.getRootNode && n.getRootNode();
      n = n.parentElement || (n.parentNode && n.parentNode.host) || (root && root.host) || null;
    }
    return null;
  }

  // Why a click / key on t must not happen now, or '' when it may.
  function forbiddenTarget(t) {
    if (!t || t.nodeType !== 1) return '';
    if (t.closest(TRANSPARENT_BACKDROP_SEL)) return ''; // a dropdown's own "click outside" layer
    if (t.matches(DIALOG_BACKDROP_SEL)) return "a dialog's backdrop";
    if (coveringLayer(t) === t && !t.querySelector(FIELDISH_SEL)) return 'a layer covering the page';
    if (t.closest(PICKER_POPUP_SEL)) return ''; // a date picker's own buttons (OK, next month)
    // The dropdown FillCraft is opening, and a row of the list it opened, are choices — "Order
    // Type", "Complete Blood Count", "Transfer to SNF" start with action words, not actions.
    if (activeClose && activeClose.el && (activeClose.el === t || activeClose.el.contains(t) || activeClose.trigger === t)) return '';
    const openList = activeOwnList || (activeClose && (activeClose.list || activeClose.panel));
    if (openList && openList.isConnected && openList.contains(t) && !t.closest('[type="submit"], form > button:not([type])')) return '';
    // A dropdown's own arrow (MUI labels it "Close" while its list is open) is not a
    // dialog's close button — but it still may not submit or leave the page.
    const dropdownArrow = !!t.closest('.MuiAutocomplete-popupIndicator, [class*="dropdown-indicator" i], [class*="DropdownIndicator"], [class*="-select__indicator"], .select2-selection__arrow, .ant-select-arrow, .el-select__caret, .v-select__menu-icon, .mdi-menu-down');
    const small = (n) => { const r = n.getBoundingClientRect(); return r.width <= 240 && r.height <= 90; };
    let a = t.closest(ACTION_BUTTON_SEL);
    const wc = componentButton(t);
    // Inside a web component the inner <button> has no text of its own: use the component.
    if (wc && (!a || !wc.contains(a) || !(a.textContent || '').trim())) a = wc;
    if (!dropdownArrow && [t, t.parentElement, a].some((n) => n && n.nodeType === 1 && n.matches(DISMISS_SEL) && small(n))) return 'a close / cancel control';
    if (!a) return '';
    if (a.matches('input[type="submit"], input[type="reset"], input[type="image"], button[type="submit"], button[type="reset"]')) return 'a submit / reset button';
    if (a === wc && /^(submit|reset)$/i.test(a.getAttribute('type') || '')) return 'a submit / reset button';
    if (a.tagName === 'A' && isNavigatingAnchor(a)) return 'a link to another page';
    if (a === wc && a.hasAttribute('href') && !/^\s*(#|javascript:)/i.test(a.getAttribute('href'))) return 'a link to another page';
    const raw = a.getAttribute('aria-label') || a.getAttribute('label') || (a.tagName === 'INPUT' ? a.value : a.textContent) || a.getAttribute('title') || '';
    const text = tidy(raw, 60);
    // A dropdown's own arrow may say "Open" / "Close" / "Toggle"; any other action word on
    // it ("Delete", "Save") still counts.
    if (dropdownArrow) return !/^(open|close|toggle|show|hide|expand|collapse)\b/i.test(actionWords(raw)) && ACTION_TEXT_RE.test(actionWords(raw)) ? `the "${text}" button` : '';
    if (a.matches(NOT_AN_ACTION_SEL)) return '';
    if (CLOSE_MARK_RE.test(text) || ACTION_TEXT_RE.test(actionWords(raw))) return `the "${text}" button`;
    // A <button> with no type inside a form is that form's submit button.
    if (a.tagName === 'BUTTON' && a.form && !a.hasAttribute('type')) return 'a submit button (a button with no type submits its form)';
    return '';
  }

  let guardDepth = 0;
  let guardOffTimer = null;
  let guardStops = 0;
  const GUARD_POINTER = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
  function stopEvent(e, why) {
    e.preventDefault();
    e.stopImmediatePropagation();
    guardStops++;
    if (guardStops <= 5) console.info(`[FillCraft] Stopped ${why} — FillCraft never submits, resets or closes anything.`);
  }
  function onGuardPointer(e) {
    if (e.isTrusted) return;
    const why = forbiddenTarget(e.composedPath ? e.composedPath()[0] : e.target);
    if (why) stopEvent(e, `a click on ${why}`);
  }
  function onGuardKey(e) {
    if (e.isTrusted) return;
    if (e.key === 'Escape' || e.key === 'Esc') return stopEvent(e, 'an Escape key press');
    if (e.key === 'Enter' || e.key === ' ') {
      const why = forbiddenTarget(e.composedPath ? e.composedPath()[0] : e.target);
      if (why) stopEvent(e, `a key press on ${why}`);
    }
  }
  function onGuardForm(e) { stopEvent(e, e.type === 'reset' ? 'a form reset' : 'a form submit'); }
  // form.submit() fires no event at all: the page-world half of the guard (guard-main.js,
  // added by the runner) stops it while <html> carries data-fillcraft-busy, and says so here.
  function onMainWorldStop(e) {
    guardStops++;
    if (guardStops <= 5) console.info(`[FillCraft] Stopped ${typeof e.detail === 'string' ? e.detail : 'a form submit'} — FillCraft never submits, resets or closes anything.`);
  }
  // Submit / reset events are not "composed": a form in shadow DOM is guarded at its root.
  let guardRoots = [];
  function guardShadowRoots(on) {
    if (on) {
      for (const r of shadowRoots()) {
        if (guardRoots.includes(r)) continue;
        for (const t of ['submit', 'reset']) r.addEventListener(t, onGuardForm, true);
        guardRoots.push(r);
      }
    } else {
      for (const r of guardRoots) for (const t of ['submit', 'reset']) r.removeEventListener(t, onGuardForm, true);
      guardRoots = [];
    }
  }
  // A press FillCraft sends to something outside the open dialog (a dropdown's list drawn
  // at the end of <body>) goes no further than <body>: the list's own handlers still get
  // it, but a page-level "pressed outside the dialog, so close it" handler does not.
  function onGuardOutsidePress(e) {
    if (e.isTrusted || !fillScope || !fillScope.isConnected) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && t.nodeType === 1 && !containsDeep(fillScope, t)) e.stopPropagation();
  }
  let guardBody = null;
  const GUARD_OUTSIDE = ['mousedown', 'pointerdown', 'touchstart', 'mouseup', 'pointerup', 'touchend', 'click', 'focusin'];
  function setGuard(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    for (const t of GUARD_POINTER) window[f](t, onGuardPointer, true);
    for (const t of ['keydown', 'keypress', 'keyup']) window[f](t, onGuardKey, true);
    for (const t of ['submit', 'reset']) window[f](t, onGuardForm, true);
    if (on) guardBody = document.body;
    if (guardBody) for (const t of GUARD_OUTSIDE) guardBody[f](t, onGuardOutsidePress, false);
    if (!on) guardBody = null;
    guardShadowRoots(on);
    document[f]('fillcraft-stopped', onMainWorldStop, true);
    // The page-world guard's flag is shared by every copy of this engine on the page (each run
    // injects one): it goes off only when none of them is working — a second call (a shortcut
    // pressed during a fill) ending must not switch it off under the running fill.
    window.__qaFormFillerGuards = Math.max(0, (window.__qaFormFillerGuards || 0) + (on ? 1 : -1));
    try { document.documentElement.toggleAttribute('data-fillcraft-busy', window.__qaFormFillerGuards > 0); } catch (_) { /* no <html> */ }
  }
  // (New shadow roots — a dialog drawn after the fill started — are guarded on each pass.)
  function refreshGuard() { if (guardDepth > 0) guardShadowRoots(true); }
  async function withGuard(fn) {
    if (guardDepth++ === 0) {
      if (guardOffTimer) clearTimeout(guardOffTimer); else setGuard(true);
      guardOffTimer = null;
      guardStops = 0;
    }
    try {
      const res = await fn();
      if (res && typeof res === 'object' && !res.error && guardStops) res.stopped = guardStops;
      return res;
    } finally {
      // Pages react a moment later (a debounced save after the last change): stay on briefly.
      if (--guardDepth === 0) guardOffTimer = setTimeout(() => { setGuard(false); guardOffTimer = null; }, 1500);
    }
  }

  function collectFields({ onlyRequired = false, skipWidgetSelects = false } = {}) {
    const selector = [
      'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]):not([type=file])',
      'textarea',
      'select',
    ].join(',');
    const all = Array.from(document.querySelectorAll(selector));
    for (const root of shadowRoots()) all.push(...root.querySelectorAll(selector));
    return all.filter((el) => {
      if (!inFillScope(el)) return false;
      // The <select> behind a Select2 / Tom Select box: the box is filled when custom
      // dropdowns are on; with them off, the select is filled by value (the box follows).
      if (el.tagName === 'SELECT' && isWidgetBackingSelect(el)) {
        // Tom Select / Selectize / Choices do not follow a change made to their <select>:
        // those are left to the widget (Custom dropdowns). Select2 (and an unknown 1-pixel
        // select) are filled by value when custom dropdowns are off.
        if (skipWidgetSelects || /(^|\s)(ts-hidden-accessible|tomselected|selectized|choices__input)(\s|$)/.test(el.className)) return false;
      }
      if (!isFieldVisible(el)) return false;
      // Skip fields living in site navigation/header — e.g. a navbar <select> with an
      // onchange that routes elsewhere, or a nav search box. Not part of the form.
      if (isInNavRegion(el)) return false;
      // The search input of a library dropdown (React-Select, MUI Autocomplete, Ant,
      // Select2): typing there never commits an option, so it is not a text field —
      // those are handled (optionally) as custom dropdowns.
      if (el.tagName === 'INPUT' && isLibraryDropdownInput(el)) return false;
      // Part of an open dropdown list: an option's own checkbox, or the list's
      // "Type to search" box. Picking options is the dropdown's job, not a field's.
      if (el.closest('[role="option"], [role="listbox"]')) return false;
      if (el.tagName === 'INPUT' && /search|filter/i.test((el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')) &&
          [el.parentElement, el.parentElement?.parentElement, el.parentElement?.parentElement?.parentElement]
            .some((p) => p && p !== document.body && p.querySelector('[role="option"]'))) return false;
      // A code editor's hidden textarea (CodeMirror, Monaco, Ace, live-code editors)
      // holds someone's source code — never form data.
      if (isCodeEditorInput(el)) return false;
      // Bot traps: a person can never see or reach these.
      if (isHoneypot(el)) return false;
      // A cookie / privacy banner's choices are the person's own decision.
      if (inConsentBanner(el)) return false;
      // Robot checks (CAPTCHA): only a real person may answer them.
      if (isCaptchaField(el)) return false;
      if (onlyRequired && !isRequired(el)) return false;
      return true;
    });
  }

  // Required = the required / aria-required attribute, OR the visible convention:
  // a "*" (or "(required)") on the field's label, or a label/wrapper classed "required".
  const REQUIRED_TEXT_RE = /\*|\(required\)|\brequired\b/i;

  function labelSaysRequired(text) {
    const t = String(text || '').trim();
    return !!t && t.length < 200 && REQUIRED_TEXT_RE.test(t);
  }

  function markedRequired(el) {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    for (const lab of el.labels || []) {
      if (/required/i.test(lab.className || '') || lab.querySelector('[class*="required" i]')) return true;
    }
    // Field wrapper (up to 3 levels) classed e.g. "form-group required" / "is-required".
    const RE = /(^|\s)(required|is-required|required-field|field-required)(\s|$)/i;
    let n = el.parentElement;
    for (let d = 0; n && d < 3; d++, n = n.parentElement) {
      if (typeof n.className === 'string' && RE.test(n.className)) return true;
      if (n.tagName === 'FORM') break;
    }
    return false;
  }

  function isRequired(el) {
    if (el.type === 'radio') {
      const group = radioGroupOf(el);
      return group.some(markedRequired) || labelSaysRequired(groupLabel(el));
    }
    if (markedRequired(el)) return true;
    // Checkbox labels are the option text ("I agree…"); only its own * counts.
    return labelSaysRequired(getLabelText(el));
  }

  // The question a radio group answers: its <legend>, radiogroup's label, or the
  // closest label before the group.
  function groupLabel(el) {
    const rg = el.closest('[role="radiogroup"]');
    if (rg) {
      const t = rg.getAttribute('aria-label') ||
        (rg.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
      if (t.trim()) return t.trim();
    }
    const legend = el.closest('fieldset')?.querySelector('legend');
    if (legend && legend.textContent.trim()) return legend.textContent.trim();
    const group = radioGroupOf(el);
    return nearestPrecedingLabel(group[0]) || precedingColumnText(group[0], group) || '';
  }

  // Custom-styled checkboxes/radios are usually visually hidden (opacity 0, 1px,
  // clipped) behind a styled <label>. Treat them as visible when their label is.
  function isFieldVisible(el) {
    if (isVisible(el)) return true;
    if (el.type !== 'checkbox' && el.type !== 'radio') return false;
    if (el.disabled) return false;
    const labels = el.labels ? Array.from(el.labels) : [];
    const wrapper = el.closest('label');
    if (wrapper && !labels.includes(wrapper)) labels.push(wrapper);
    return labels.some(isVisible);
  }

  // ARIA separates choosing a value (a "listbox": role=listbox / combobox,
  // aria-haspopup="listbox") from ACTION menus (role=menu, aria-haspopup="menu"/"true")
  // whose items can delete, archive, log out… Only listboxes are ever opened.
  function opensListbox(el) {
    if (!el || !el.getAttribute) return false;
    const role = el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    return (el.getAttribute('aria-haspopup') || '').toLowerCase() === 'listbox';
  }

  // Explicitly an action/navigation menu trigger (ARIA menu popup, Bootstrap
  // data-toggle="dropdown") and not a listbox — never treated as a dropdown field.
  function isActionMenuTrigger(el) {
    if (!el || !el.getAttribute || opensListbox(el)) return false;
    const pop = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (pop && pop !== 'false' && pop !== 'listbox') return true;
    return el.getAttribute('data-toggle') === 'dropdown' || el.getAttribute('data-bs-toggle') === 'dropdown';
  }

  // Custom dropdown wrappers (React-Select / MUI / Ant / ARIA combobox / Chakra / generic).
  const CUSTOM_DROPDOWN_SELECTOR = [
    // Library-specific
    '.MuiSelect-select:not(.Mui-disabled)',
    '.MuiAutocomplete-root',
    '.react-select__control',
    '.ant-select:not(.ant-select-disabled)',
    '.select2-container',
    '.chakra-select__field',
    // ARIA-based
    // (Disabled ones too: a dependent dropdown such as City is enabled once State is filled;
    // fillCustomDropdown checks "disabled" when its turn comes.)
    '[role="combobox"]',
    '[role="listbox"][aria-haspopup]',
    '[aria-haspopup="listbox"]:not([disabled])',
    'div[role="button"][aria-haspopup="listbox"]',
    // Generic class-based hints (broad — runtime visibility/structure check filters false positives)
    '[class*="dropdown-trigger" i]',
    '[class*="dropdown-toggle" i]',
    '[class*="select-control" i]',
    '[class*="select-trigger" i]',
    '[class*="select-input" i]',
  ].join(',');

  // Heuristic: catches dropdown-like elements that don't match any specific selector.
  // Inclusion paths (any one is enough):
  //   1. aria-haspopup attribute or role="combobox"/"listbox" — strongest signal
  //   2. A class containing select/dropdown/combobox/picker/trigger/toggle
  //      AND a chevron icon or interactive cursor — covers libraries that don't
  //      use aria correctly
  //   3. Visible "Select X" placeholder text AND (chevron OR class hint OR interactive)
  function findHeuristicDropdowns() {
    const out = [];
    const candidates = document.querySelectorAll('div, button');
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      if (el.tagName === 'BUTTON' && (el.type === 'submit' || el.type === 'reset')) continue;
      // Never treat site navigation / menu links as form dropdowns.
      if (isInNavRegion(el) || isNavigatingAnchor(el)) continue;
      // A date / time picker ("ant-picker") is typed into, not chosen from.
      if (isDatePickerBox(el)) continue;

      // Strongest signal: ARIA tells us it's a dropdown
      if (opensListbox(el)) { out.push(el); continue; }
      const role = el.getAttribute('role');
      if (role === 'combobox' || role === 'listbox') { out.push(el); continue; }

      const cls = (typeof el.className === 'string') ? el.className.toLowerCase() : '';
      // (Not bare "trigger"/"toggle": Angular adds mat-mdc-tooltip-trigger to anything with a tooltip.)
      const looksDropdownish = /(?:^|[\s_-])(select|dropdown|combobox|picker)(?:[\s_-]|$)|(select|dropdown)[\s_-]*(trigger|toggle)/.test(cls);

      const hasArrow = !!el.querySelector('svg, [class*="chevron" i], [class*="caret" i], [class*="arrow" i], [class*="indicator" i]');
      const style = window.getComputedStyle(el);
      const isInteractive = el.tabIndex >= 0 ||
                            el.getAttribute('role') === 'button' ||
                            el.tagName === 'BUTTON' ||
                            style.cursor === 'pointer';

      // Class hint + (chevron OR interactive) — catches dropdowns that already show a value
      if (looksDropdownish && (hasArrow || isInteractive)) {
        out.push(el);
        continue;
      }

      // Placeholder text + (chevron OR interactive OR class hint)
      const text = (el.textContent || '').trim();
      if (text && text.length < 40 && PLACEHOLDER_RE.test(text) &&
          !el.querySelector('a, button, h1, h2, h3, h4, h5, h6, input, select, textarea')) {
        if (looksDropdownish || (hasArrow && isInteractive)) {
          out.push(el);
          continue;
        }
      }
    }
    return out;
  }

  // A date / time picker's box or its calendar popup.
  function isDatePickerBox(el) {
    if (el.closest(PICKER_POPUP_SEL) || el.closest(CALENDAR_ROOT_SEL)) return true;
    if (el.matches('.ant-picker, .ant-picker-range, .el-date-editor, .react-datepicker-wrapper, .react-datepicker__input-container, .MuiPickersInputBase-root, .MuiPickersTextField-root, [class*="datepicker" i], [class*="date-picker" i], [class*="timepicker" i], [class*="time-picker" i]')) return true;
    const input = el.querySelector && el.querySelector('input:not([type=hidden])');
    return !!(input && el.querySelectorAll('input:not([type=hidden])').length <= 2 && isDatePickerWidget(input));
  }

  // On screen (not hidden) — whether or not it is currently disabled.
  function isShown(el) {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  function collectCustomDropdowns() {
    // Visibility is judged on the whole component: a disabled React-Select hides its inner
    // input (opacity 0) while its box stays on screen.
    const fromSelector = Array.from(new Set(Array.from(document.querySelectorAll(CUSTOM_DROPDOWN_SELECTOR)).map(dropdownRoot)))
      .filter(el => isShown(el) && !isInNavRegion(el) && !isNavigatingAnchor(el));

    // Heuristic-detected dropdowns that aren't already covered by selector matches
    const heuristic = findHeuristicDropdowns().filter((h) =>
      !fromSelector.some((s) => s.contains(h) || h.contains(s))
    );
    // In-house dropdowns known only by what they show ("Select Option from Dropdown" + ▾).
    const prompts = findPromptTriggers().filter((p) =>
      ![...fromSelector, ...heuristic].some((s) => s.contains(p) || p.contains(s))
    );

    const all = [...fromSelector, ...heuristic, ...prompts];

    // Dedupe nested matches — keep outermost
    return all.filter((el, i, arr) =>
      !arr.some((o, j) => j !== i && o !== el && o.contains(el))
    );
  }

  // In-house dropdowns with no ARIA roles and no telling class names: a box in a form that
  // says "Select Option from Dropdown" / "Select" / "Choose…" and ends in an arrow, and has
  // a label — what a person recognises as a dropdown. (Toolbar "Select ▾" menus outside a
  // form, "Select file" / "Choose photo" upload areas and date boxes are not.)
  const NOT_A_DROPDOWN_PROMPT_RE = /select\s+(all|none|file|files|a\s+file|photos?|images?|documents?)\b|choose\s+(file|files|a\s+file|photos?|images?)\b|upload|drag|drop\b|browse|date|time|calendar/i;
  function findPromptTriggers() {
    const out = [];
    const root = fillScope || document.body;
    if (!root) return out;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim().length < 40 && /^\s*(?:select|choose|please\s+select|pick)\b/i.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n = walk.nextNode(); n && out.length < 60; n = walk.nextNode()) {
      if (NOT_A_DROPDOWN_PROMPT_RE.test(n.nodeValue)) continue;
      const start = n.parentElement;
      if (!start || start.closest('option, select, label, legend, a[href], [role="option"], [role="listbox"], [role="menu"], [role="menuitem"], [role="tab"], [role="dialog"] > header')) continue;
      for (let box = start, i = 0; box && box !== document.body && i < 3; box = box.parentElement, i++) {
        if (box.querySelector('input:not([type=hidden]), select, textarea')) break; // a real field is filled as one
        if (!arrowAtEnd(box)) continue;
        const inForm = !!box.closest('form, [role="dialog"], [aria-modal="true"], dialog') || !!(fillScope && containsDeep(fillScope, box));
        if (inForm && isShown(box) && !isInNavRegion(box) && inFillScope(box) && dropdownLabelText(box)) out.push(box);
        break;
      }
    }
    return out;
  }
  // An arrow / chevron icon at the right end of box (≤ 28 px), or null.
  function arrowAtEnd(box) {
    const r = box.getBoundingClientRect();
    if (r.width < 60 || r.height > 80) return null;
    for (const ic of box.querySelectorAll('svg, i, [class*="arrow" i], [class*="chevron" i], [class*="caret" i], [class*="icon" i]')) {
      const q = ic.getBoundingClientRect();
      if (q.width > 0 && q.width <= 28 && q.height <= 28 && q.right >= r.right - 48) return ic;
    }
    return null;
  }

  // The panel that appeared next to a dropdown after it was clicked — for lists built
  // without any recognisable markup: a box with a search field, checkboxes or several rows
  // (never a one-line message such as "Required").
  function freshPanel(before, el) {
    if (!before) return null;
    const added = new Set();
    for (const n of document.querySelectorAll('body *')) if (!before.has(n)) added.add(n);
    for (const n of added) {
      if (added.has(n.parentElement) || n.contains(el) || !isShown(n)) continue;
      const r = n.getBoundingClientRect();
      if (r.height < 30 || !isNearField(n, el)) continue;
      const hasInput = !!n.querySelector('input:not([type=hidden]), [role="checkbox"]');
      const rows = n.querySelectorAll('*').length;
      const says = /^\s*(loading|searching|no\s|nothing)/i.test(n.textContent || '');
      if (hasInput || rows >= 4 || says) return n;
    }
    return null;
  }
  // The rows of such a panel: rows with their own checkbox / radio, else the largest run of
  // look-alike siblings (same tag and class) with short text.
  function newListRows(before, el) {
    const panel = freshPanel(before, el);
    if (!panel) return [];
    const rows = [];
    for (const b of panel.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]')) {
      let row = b.closest('label, li, [role="option"], [class*="row" i], [class*="item" i], [class*="opt" i]');
      if (!row || !panel.contains(row) || row === panel) row = b.parentElement;
      const t = (row.textContent || '').trim();
      if (row && row !== panel && t && t.length <= 80 && !rows.includes(row)) rows.push(row);
    }
    if (rows.length) return rows;
    let best = [];
    for (const p of [panel, ...panel.querySelectorAll('*')]) {
      const kids = Array.from(p.children).filter(isShown);
      if (kids.length < 2) continue;
      const groups = new Map();
      for (const c of kids) {
        const sig = c.tagName + '.' + (typeof c.className === 'string' ? c.className.trim() : '');
        groups.set(sig, (groups.get(sig) || []).concat(c));
      }
      for (const g of groups.values()) {
        const ok = g.filter((c) => { const t = (c.textContent || '').trim(); return t && t.length <= 80 && !c.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select, button'); });
        if (ok.length >= 2 && ok.length > best.length) best = ok;
      }
    }
    return best;
  }

  // Returns true if the element looks like a dropdown trigger (not a plain button/upload).
  // Used to avoid false positives like "Profile Photo" → upload button.
  function looksLikeDropdownControl(el) {
    if (!el) return false;
    if (opensListbox(el)) return true;
    if (isReadonlyPickerInput(el)) return true;
    const role = el.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    if (el.tagName === 'SELECT') return true;
    const cls = (typeof el.className === 'string') ? el.className.toLowerCase() : '';
    if (/(?:^|[\s_-])(select|dropdown|combobox|picker)(?:[\s_-]|$)|(select|dropdown)[\s_-]*(trigger|toggle)/.test(cls)) return true;
    if (el.matches?.('.MuiSelect-select, .MuiAutocomplete-root, .react-select__control, .ant-select-selector, .ant-select, .select2-selection, .chakra-select__field')) return true;
    // A trigger showing placeholder text like "Select X" + a chevron icon
    const text = (el.textContent || '').trim();
    if (text && text.length < 60 && PLACEHOLDER_RE.test(text)) {
      if (el.querySelector('svg, [class*="chevron" i], [class*="caret" i], [class*="arrow" i], [class*="indicator" i]')) return true;
    }
    // Walk up two ancestors to catch wrapper/inner-trigger pairs
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 2) {
      if (opensListbox(parent)) return true;
      const prole = parent.getAttribute('role');
      if (prole === 'combobox' || prole === 'listbox') return true;
      const pcls = (typeof parent.className === 'string') ? parent.className.toLowerCase() : '';
      if (/(?:^|[\s_-])(select|dropdown|combobox|picker)(?:[\s_-]|$)/.test(pcls)) return true;
      parent = parent.parentElement;
      depth++;
    }
    return false;
  }

  // A read-only text box that opens a list when clicked — the trigger of many in-house
  // (multi-)select components: it says "Select Option from Dropdown" / "Select" / "Choose…"
  // and / or shows an arrow beside it. (Date boxes are calendars, handled elsewhere.)
  function isReadonlyPickerInput(el) {
    if (!el || el.tagName !== 'INPUT' || !el.readOnly || el.disabled) return false;
    if (!['text', 'search', ''].includes((el.type || '').toLowerCase())) return false;
    const hint = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${typeof el.className === 'string' ? el.className : ''} ${getLabelText(el)}`;
    if (/date|time|calendar|period|range|\bday\b|month|year|dob|birth|expir|schedule/i.test(hint) || isDatePickerWidget(el)) return false;
    if (PLACEHOLDER_RE.test(el.placeholder || '')) return true;
    // An arrow drawn in the box, right after the text (MUI end adornment, a chevron icon).
    // (Only a real arrow / expand icon — not a copy, lock or info icon.)
    const box = el.parentElement;
    const ARROW_SEL = '[class*="arrow" i], [class*="chevron" i], [class*="caret" i], [class*="expand" i], [class*="dropdown" i], [data-testid*="Arrow"], [data-testid*="Expand"], [data-testid*="Chevron"], [data-testid*="DropDown" i]';
    const arrow = box && Array.from(box.querySelectorAll(ARROW_SEL))
      .find((a) => !a.contains(el) && !/search|close|clear|calendar/i.test(typeof a.className === 'string' ? a.className : (a.className && a.className.baseVal) || ''));
    return !!arrow;
  }

  // ---------- Label-driven dropdown discovery (most reliable) ----------
  // Finds every visible label, locates its control, and includes any control
  // that looks like a dropdown — regardless of whether we have specific data
  // for that field. For unclassified fields, we'll pick a random option from
  // the live dropdown list (per user instruction: always use values from the
  // dropdown itself).
  function findDropdownsByLabel() {
    const result = [];
    const seen = new WeakSet();
    const labels = Array.from(document.querySelectorAll('label, legend'));
    for (const lab of labels) {
      if (!isVisible(lab)) continue;
      const text = (lab.textContent || '').trim();
      if (!text || text.length > 100) continue;

      // Classify by the same label rules as other fields ("Billing State *", "Reason for
      // leaving") — may be null for unknown fields, that's fine.
      const key = resolveKey(text, []);

      const control = findControlForLabel(lab);
      if (!control || seen.has(control)) continue;
      if (isInNavRegion(control) || isNavigatingAnchor(control)) continue;
      seen.add(control);

      // Skip things that Pass 1 already handles correctly.
      const tag = control.tagName;
      if (tag === 'TEXTAREA') continue;
      // Checkboxes, radios, file pickers and buttons are never dropdowns — clicking
      // them while "opening" would toggle / upload / submit.
      if (tag === 'INPUT' && ['checkbox', 'radio', 'file', 'submit', 'reset', 'button', 'image'].includes((control.type || '').toLowerCase())) continue;
      if (tag === 'INPUT' && !control.readOnly) {
        const type = (control.type || '').toLowerCase();
        if (['text','search','tel','email','number','password','date','url','datetime-local','month','time'].includes(type)) {
          continue; // Pass 1 fills it as text
        }
      }
      // Native <select> is handled in Pass 1 too — but only include if Pass 1 already filled it.
      // We'll keep them out here to avoid double-fills.
      if (tag === 'SELECT') continue;

      // Only treat the control as a dropdown if it actually looks like one. This avoids
      // accidentally clicking upload buttons / submit buttons / unrelated triggers.
      if (!looksLikeDropdownControl(control)) continue;

      result.push({ control, key, labelText: text });
    }
    return result;
  }

  function findControlForLabel(lab) {
    // 1. for=id binding
    const forId = lab.getAttribute('for');
    if (forId) {
      const target = document.getElementById(forId);
      if (target && isControlVisible(target)) return target;
    }
    // 2. Inside the label
    const inside = findInteractiveIn(lab);
    if (inside && isControlVisible(inside)) return inside;
    // 3. Forward siblings of the label
    let sib = lab.nextElementSibling;
    let hops = 0;
    while (sib && hops < 8) {
      const ctrl = findInteractiveIn(sib);
      if (ctrl && isControlVisible(ctrl)) return ctrl;
      sib = sib.nextElementSibling;
      hops++;
    }
    // 4. Walk up — find an interactive sibling/cousin within a shared ancestor
    let ancestor = lab.parentElement;
    let depth = 0;
    while (ancestor && depth < 5) {
      const ctrl = findInteractiveIn(ancestor, lab);
      if (ctrl && isControlVisible(ctrl) && !lab.contains(ctrl)) return ctrl;
      ancestor = ancestor.parentElement;
      depth++;
    }
    return null;
  }

  function findInteractiveIn(node, exclude) {
    if (!node) return null;
    const interactiveSel = [
      // Native
      'select:not([disabled])',
      'input:not([type=hidden]):not([disabled])',
      'button:not([type=submit]):not([type=reset]):not([disabled])',
      // ARIA
      '[role="combobox"]:not([disabled]):not([aria-disabled="true"])',
      '[role="listbox"]:not([aria-disabled="true"])',
      '[aria-haspopup="listbox"]:not([disabled])',
      '[role="button"][aria-haspopup="listbox"]:not([disabled])',
      '[tabindex="0"]:not([disabled])',
      // Library-specific
      '.MuiSelect-select:not(.Mui-disabled)',
      '.MuiAutocomplete-root',
      '.react-select__control',
      '.ant-select:not(.ant-select-disabled)',
      '.select2-selection',
      '.chakra-select__field',
      // Generic class-based
      '[class*="dropdown-trigger" i]',
      '[class*="dropdown-toggle" i]',
      '[class*="dropdown-control" i]',
      '[class*="select-control" i]',
      '[class*="select-trigger" i]',
      '[class*="select-input" i]',
      '[class*="select-toggle" i]',
      '[class*="combobox-trigger" i]',
      '[class*="picker-input" i]',
    ];
    // Phase 1: self matches
    for (const sel of interactiveSel) {
      if (node.matches?.(sel)) return node;
    }
    // Phase 2: descendant matches
    for (const sel of interactiveSel) {
      const matches = node.querySelectorAll?.(sel) || [];
      for (const m of matches) {
        if (exclude && exclude.contains(m)) continue;
        return m;
      }
    }
    // Phase 3: anything that looks like a dropdown trigger (placeholder + chevron,
    // dropdown-y wrapper class, or aria-haspopup on an ancestor). Catches generic
    // custom dropdowns that use neither ARIA nor any standard library class.
    if (looksLikeDropdownControl(node) && (!exclude || !exclude.contains(node))) return node;
    const candidates = node.querySelectorAll?.('div, button, span') || [];
    for (const m of candidates) {
      if (exclude && exclude.contains(m)) continue;
      if (looksLikeDropdownControl(m)) return m;
    }
    return null;
  }

  function isControlVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  // ---------- Native value setting (framework-compatible) ----------
  function nativeSet(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
  }

  // input + change, then a REAL blur (native blur + focusout) so validation libraries
  // that mark fields "touched" on blur (Formik, React Hook Form, Angular) run.
  function fireEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (document.activeElement === el) el.blur();
    else el.dispatchEvent(new Event('blur'));
  }

  // Case-insensitive match of a hint against option text. Exact match first; then a
  // whole-word match, so "male" never matches "Female". Hints of 1–2 chars ("M",
  // "US") only match exactly.
  function findByHints(items, hints, textsOf) {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const list = (Array.isArray(hints) ? hints : [hints])
      .filter((h) => h != null && String(h).trim() !== '')
      .map(norm);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const h of list) {
      const hit = items.find((it) => textsOf(it).some((t) => norm(t) === h));
      if (hit) return hit;
    }
    for (const h of list) {
      if (h.length <= 2) continue;
      const re = new RegExp(`(^|[^a-z0-9])${esc(h)}($|[^a-z0-9])`, 'i');
      // ("Not Hispanic or Latino", "Non-smoker" are the opposite of the value.)
      const negated = new RegExp(`(^|[^a-z0-9])(not|non)[\\s-]+${esc(h)}`, 'i');
      const hits = items.filter((it) => textsOf(it).some((t) => re.test(norm(t)) && !negated.test(norm(t))));
      if (!hits.length) continue;
      // The closest of them: one that starts with the value, then the shortest — "United States
      // of America", not "United States Minor Outlying Islands" listed before it.
      const starts = (it) => (textsOf(it).some((t) => norm(t).startsWith(h)) ? 1 : 0);
      const len = (it) => Math.min(...textsOf(it).map((t) => norm(t).length || Infinity));
      return hits.slice().sort((a, b) => (starts(b) - starts(a)) || (len(a) - len(b)))[0];
    }
    return null;
  }

  // Options like "Select…", "-- Choose --", "Please select" are placeholders.
  function isPlaceholderText(t) {
    const s = String(t || '').trim();
    return !s || /^(select|choose|please[\s_-]*(select|choose)|pick|none)\b/i.test(s) || /^(--|n\/a\b)/i.test(s);
  }

  // Returns true if the value was actually accepted. Typed inputs (number, date,
  // email, etc.) silently reject non-conforming strings — e.g. edge-case XSS/long
  // payloads on a type=number field leave it empty. We report that so the caller
  // doesn't count an empty field as "filled".
  function setText(el, value) {
    el.focus({ preventScroll: true });
    nativeSet(el, value);
    // Checked after the input event (input masks such as Inputmask show the value only once
    // their input handler ran) but before blur (some libraries reformat/clear on blur, which
    // is their call).
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const accepted = !(String(value) !== '' && el.value === '');
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (document.activeElement === el) el.blur();
    else el.dispatchEvent(new Event('blur'));
    return accepted;
  }

  // A mask still showing its template where characters should be ("9__-__-____",
  // "06/dd/yyyy"): the value did not get in, whatever the field now holds.
  function showsMaskTemplate(shown, wanted) {
    const v = String(shown || '');
    const w = String(wanted || '');
    if (/_/.test(v) && !/_/.test(w)) return true;
    return /(^|[^a-z])(dd|mm|yy|yyyy|hh)([^a-z]|$)/i.test(v) && !/(^|[^a-z])(dd|mm|yy|yyyy|hh)([^a-z]|$)/i.test(w);
  }

  // Types the text one character at a time, handing the field the plain text typed so far
  // on each key (for masks that mangle a key appended to their own formatted text).
  async function typeProgressively(el, text, perCharMs = 22) {
    el.focus({ preventScroll: true });
    nativeSet(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const chars = Array.from(String(text));
    for (let i = 1; i <= chars.length; i++) {
      const ch = chars[i - 1];
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      nativeSet(el, chars.slice(0, i).join(''));
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch })); }
      catch { el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, perCharMs));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // SSN boxes the page emptied: filled again with the other form of the number (see the SSN value).
  let ssnOtherForm = new WeakSet();
  // Boxes typed into while the current dropdown is filled (see fillCustomDropdownInner).
  let typedBoxes = new Set();
  // Character-by-character typing — required for phone-input libraries that listen for
  // each keystroke and reformat as the user types. Standard nativeSet+input event doesn't
  // always trigger their formatting / state updates (especially react-phone-input-2,
  // react-international-phone, intl-tel-input).
  async function typeSlowly(el, text, perCharMs = 18, { blur = true } = {}) {
    if (text) typedBoxes.add(el);
    el.focus({ preventScroll: true });
    nativeSet(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    for (const ch of String(text)) {
      // 1. keydown / keypress
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true, cancelable: true }));
      // 2. append via the native setter so React/Vue see the change. Appending to the
      //    CURRENT value keeps whatever an input mask has formatted so far ("123-").
      nativeSet(el, el.value + ch);
      // 3. fire input with InputEvent for libraries that read inputType/data
      try {
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true,
          inputType: 'insertText', data: ch,
        }));
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, perCharMs));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (blur && document.activeElement === el) el.blur();
  }

  // Robust phone fill — handles all the common phone-input library patterns by
  // typing the digits one at a time, letting the library format as it goes.
  async function fillPhoneInputRobust(el, digits) {
    // Try fast path first: nativeSet + events. If the library accepts it, we're done.
    // The library may reformat ("(213) 555-0158", "+1 213…"): the DIGITS must be exactly
    // ours, optionally after the country code 1.
    const exact = () => {
      const v = (el.value || '').trim();
      const d = v.replace(/\D/g, '');
      return v.startsWith('+') ? d === '1' + digits : d === digits || d === '1' + digits;
    };
    // The widget shows an international dial code ("+1", "+1 (") or asks for one: type the
    // number with its +1, so the widget cannot take the area code for a country code.
    const international = /^\s*\+/.test(el.value || '') || /^\+/.test((el.placeholder || '').trim());
    const text = international ? '+1' + digits : digits;
    setText(el, text);
    await new Promise(r => setTimeout(r, 60));
    if (exact()) return true;

    // Fast path didn't take — fall back to slow typing.
    await typeSlowly(el, text, 22);
    if (exact()) return true;

    // Some widgets mangle keystrokes appended to their formatted text ("(213) 5" + "5"):
    // hand them the plain digits typed so far on each keystroke and let them format.
    // (Typed key by key the box keeps the focus: leave it, as typeSlowly does — a later
    // dropdown must never take a focused field for its list's search box.)
    const done = () => { if (document.activeElement === el) el.blur(); return true; };
    await typeProgressively(el, text, 22);
    if (exact()) return done();
    if (international) {
      await typeProgressively(el, digits, 22);
      if (exact()) return done();
    }

    // Never leave a wrong number behind: empty the field and report it.
    await typeSlowly(el, '', 0);
    return false;
  }

  function setCheckbox(el, value) {
    if (el.checked === !!value) return;
    el.click();
  }

  // Picks from `items` by strategy:
  //   'match'  (default) — the option matching the generated data, else a random one
  //   'first' / 'last'   — the first / last real option
  //   'random'           — any real option
  // "Real" = not a "Select…" / "-- Choose --" placeholder.
  function chooseOption(items, hints, textsOf, strategy = 'match') {
    const real = items.filter((it) => !isPlaceholderText(textsOf(it).filter(Boolean).pop()));
    const pool = real.length ? real : items;
    if (!pool.length) return null;
    if (strategy === 'first') return pool[0];
    if (strategy === 'last') return pool[pool.length - 1];
    if (strategy !== 'random') {
      const hit = findByHints(pool, hints, textsOf);
      if (hit) return hit;
    }
    // The list lacks the person's own value: any other choice — but never a "none" answer for
    // someone who has one ("Self Pay" for an insured patient whose carrier is not listed).
    // (The "Random" setting stays fully random.)
    const hasValue = strategy !== 'random' && Array.isArray(hints) && hints.some((h) => h != null && String(h).trim() !== '');
    const NONE_LIKE = /^\s*(none|n\/a|not\s+applicable|self[\s-]*pay|uninsured|no\s+insurance)\s*$/i;
    const fair = hasValue ? pool.filter((it) => !NONE_LIKE.test(textsOf(it).filter(Boolean).pop() || '')) : pool;
    const from = fair.length ? fair : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  function setRadioGroup(els, valueHints, strategy) {
    if (!els.length) return false;
    const candidates = els.filter((r) => !r.disabled && isFieldVisible(r));
    if (!candidates.length) return false;
    const target = chooseOption(candidates, valueHints, (r) => [r.value, getLabelText(r)], strategy);
    if (!target.checked) target.click();
    if (target.checked) return true;
    // The page re-drew the radios when one was chosen: its new copy (same name and value) counts.
    if (!target.isConnected && target.name) {
      const twin = Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(target.name)}"]`)).find((r) => r.value === target.value);
      return !!(twin && twin.checked);
    }
    return false;
  }

  // Native <select> (single or multiple).
  function setSelect(el, valueHints, strategy) {
    if (!el.options || el.options.length === 0) return false;
    const opts = Array.from(el.options).filter((o) => !o.disabled && o.value !== '');
    if (!opts.length) return false;

    const chosen = chooseOption(opts, valueHints, (o) => [o.value, o.textContent], strategy);

    el.focus({ preventScroll: true });
    if (el.multiple) {
      Array.from(el.options).forEach((o) => { o.selected = o === chosen; });
    } else {
      nativeSet(el, chosen.value);
    }
    fireEvents(el);
    return chosen.selected;
  }

  // Returns true only if the browser accepted the value (a native date input
  // silently rejects anything that is not yyyy-mm-dd / yyyy-mm / yyyy-mm-ddThh:mm).
  function setDate(el, value) {
    el.focus({ preventScroll: true });
    nativeSet(el, value);
    if (el.value === '' && /^\d{4}-\d{2}-\d{2}$/.test(value) && (el.type || '') === 'date') {
      try { el.valueAsDate = new Date(value + 'T00:00:00Z'); } catch {}
    }
    const accepted = el.value !== '';
    fireEvents(el);
    return accepted;
  }

  // ---------- Boundary values (edge types limit-min / limit-under / limit-max / limit-over) ----------
  // Built from the field's OWN limits. Fields that declare no length limit use the
  // common 255-character column size. Returns { value } or { skip: reason }.
  const DEFAULT_MAX_LENGTH = 255;

  function boundaryValue(el, key, which) {
    const type = (el.type || '').toLowerCase();

    if (type === 'number' || type === 'range') {
      const step = el.step && el.step !== 'any' && Number(el.step) > 0 ? Number(el.step) : 1;
      const hasMin = el.min !== '' && Number.isFinite(Number(el.min));
      const hasMax = el.max !== '' && Number.isFinite(Number(el.max));
      const min = hasMin ? Number(el.min) : 0;
      const max = hasMax ? Number(el.max) : 2147483647; // 32-bit int max
      const v = { min, under: min - step, max, over: max + step }[which];
      const decimals = (String(step).split('.')[1] || '').length;
      return { value: v.toFixed(decimals) };
    }

    if (type === 'time') {
      // A whole day is the natural range; min−1 / max+1 need declared limits.
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      const min = el.min ? el.min.slice(0, 5) : null;
      const max = el.max ? el.max.slice(0, 5) : null;
      if (which === 'min') return { value: min || '00:00' };
      if (which === 'max') return { value: max || '23:59' };
      if (which === 'under') return min && toMin(min) > 0 ? { value: fromMin(toMin(min) - 1) } : { skip: 'No time limit declared' };
      return max && toMin(max) < 1439 ? { value: fromMin(toMin(max) + 1) } : { skip: 'No time limit declared' };
    }

    if (type === 'date' || type === 'month' || type === 'datetime-local') {
      // Work in each input's own unit: a day (date), a month (month), a minute
      // (datetime-local) — so "max + 1" is really one step past the max.
      const p2 = (n) => String(n).padStart(2, '0');
      const now = new Date(); // local time: "today" is the user's today, not UTC's
      const fmt = (d) => type === 'month'
        ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
        : type === 'datetime-local'
          ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
          : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const parse = (s) => {
        const m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/);
        return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) : null;
      };
      const step = (d, n) => {
        const r = new Date(d);
        if (type === 'month') r.setMonth(r.getMonth() + n);
        else if (type === 'datetime-local') r.setMinutes(r.getMinutes() + n);
        else r.setDate(r.getDate() + n);
        return r;
      };
      // Declared limits win; a DOB is bounded by 1900-01-01 … today.
      const min = el.min ? parse(el.min) : (key === 'dob' ? new Date(1900, 0, 1) : null);
      const max = el.max ? parse(el.max) : (key === 'dob' ? now : null);
      const base = which === 'min' || which === 'under' ? min : max;
      if (!base) return { skip: 'No date limit declared' };
      const d = { min: base, under: step(base, -1), max: base, over: step(base, 1) }[which];
      return { value: fmt(d) };
    }

    if (type === 'week') {
      // ISO weeks ("2026-W40"): one week past the declared max / before the min.
      const parseWeek = (s) => {
        const m = String(s || '').match(/^(\d{4})-W(\d{2})$/);
        if (!m) return null;
        const jan4 = new Date(Date.UTC(+m[1], 0, 4));
        const monday = new Date(jan4);
        monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+m[2] - 1) * 7);
        return monday;
      };
      const fmtWeek = (d) => {
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
        const wk = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
        return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
      };
      const base = which === 'min' || which === 'under' ? parseWeek(el.min) : parseWeek(el.max);
      if (!base) return { skip: 'No week limit declared' };
      if (which === 'min' || which === 'max') return { value: fmtWeek(base) };
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + (which === 'over' ? 7 : -7));
      return { value: fmtWeek(d) };
    }

    // Text-like: build a string of exactly the boundary length, shaped like the field.
    // (An email box without a declared minimum: the shortest real address, a@b.co — a single
    // "A" would test the email format, not the length.)
    const emailLike = type === 'email' || key === 'email' || key === 'emailAlt';
    const minLen = el.minLength > 0 ? el.minLength : (which === 'under' ? null : emailLike ? 6 : 1);
    const maxLen = el.maxLength > 0 ? el.maxLength : DEFAULT_MAX_LENGTH;
    const len = { min: minLen, under: minLen == null ? null : minLen - 1, max: maxLen, over: maxLen + 1 }[which];
    if (len == null) return { skip: 'No minimum length declared' };
    if (len <= 0) return { skip: 'Minimum is 1 — below it is an empty field' };
    return { value: stringOfLength(el, key, len) };
  }

  function stringOfLength(el, key, len) {
    const type = (el.type || '').toLowerCase();
    const repeat = (unit, n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    if (type === 'email' || key === 'email' || key === 'emailAlt') {
      const domain = '@example.com';
      if (len > domain.length + 1) return repeat('a', len - domain.length) + domain;
      if (len >= 6) return repeat('a', len - 5) + '@b.co'; // short ones are still real addresses
    }
    const numeric = type === 'tel' || PHONE_KEYS.includes(key) ||
      ['zip', 'ssn', 'npi', 'mrn', 'age', 'number', 'quantity', 'ccNumber', 'ccCvv'].includes(key) ||
      /numeric|decimal|tel/.test(el.inputMode || '');
    return repeat(numeric ? '1234567890' : 'Abcdefghij', len);
  }

  // True for an existing calendar date in YYYY-MM-DD (so "2025-02-30" is false).
  function isRealDate(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  // "3:00 PM" → "15:00"; anything else unchanged.
  function to24h(v) {
    const m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
    if (!m) return v;
    const h = (+m[1] % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }

  // "MM/DD/YYYY" → "YYYY-MM-DD"; ISO strings pass through; anything else unchanged.
  function toISODate(v) {
    const s = String(v || '');
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s;
  }

  // ---------- Highlight ----------
  function injectHighlightStyle() {
    if (document.getElementById('__qa-ff-style')) return;
    const s = document.createElement('style');
    s.id = '__qa-ff-style';
    s.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #58a6ff !important;
        outline-offset: 1px !important;
        transition: outline-color 0.6s ease-out !important;
      }
      .${HIGHLIGHT_CLASS}-valid { outline-color: #3fb950 !important; }
      .${HIGHLIGHT_CLASS}-invalid { outline-color: #f85149 !important; }
      .${HIGHLIGHT_CLASS}-edge { outline-color: #d29922 !important; }
      .${HIGHLIGHT_CLASS}-clear { outline-color: #8b949e !important; }
      .${HIGHLIGHT_CLASS}-reveal { outline: 3px solid #a371f7 !important; outline-offset: 3px !important; }
    `;
    document.documentElement.appendChild(s);
  }

  function flashHighlight(el, mode, ms = 1500) {
    // A field in shadow DOM needs the outline style in its own shadow root.
    const root = el.getRootNode && el.getRootNode();
    if (root && root !== document && root.host && !root.querySelector('style[data-fillcraft-highlight]')) {
      const main = document.getElementById('__qa-ff-style');
      if (main) { const s = main.cloneNode(true); s.removeAttribute('id'); s.setAttribute('data-fillcraft-highlight', ''); root.appendChild(s); }
    }
    el.classList.add(HIGHLIGHT_CLASS, `${HIGHLIGHT_CLASS}-${mode}`);
    setTimeout(() => {
      el.classList.remove(HIGHLIGHT_CLASS, `${HIGHLIGHT_CLASS}-${mode}`);
    }, ms);
  }

  // ---------- Phone field handling (split + format-aware) ----------
  // Which part of a split phone (area / exchange / line) a short box holds. Uses
  // name/label hints first, then the box's position among its sibling boxes.
  function phoneSegment(el) {
    const hint = [el.name, el.id, el.getAttribute('aria-label'), getLabelText(el)].join(' ').toLowerCase();
    if (/area/.test(hint)) return 'area';
    if (/exch|prefix/.test(hint)) return 'exchange';
    if (/\bline\b|last|suffix/.test(hint)) return 'line';
    if (el.maxLength === 4) return 'line';
    const group = splitPhoneGroup(el);
    if (group) {
      const threes = group.filter((i) => i.maxLength === 3);
      // 3/3/4 → first 3-box is the area code; 3/4 → the 3-box is the exchange.
      return threes.length >= 2 && threes.indexOf(el) === 0 ? 'area' : 'exchange';
    }
    return 'area'; // a lone 3-digit box is almost always an area code
  }

  // Valid-mode phone value, shaped to what the input expects.
  function pickPhoneValue(el, key, dataset) {
    const ml = el.maxLength;
    const pattern = el.pattern || '';
    const placeholder = (el.placeholder || '').trim();
    // Use this field's own number (fax / emergency contact differ from the main phone).
    const own = String(dataset[key] || '').replace(/\D/g, '');
    const digits = (own.length >= 10 ? own : String(dataset.phoneDigits || '')).slice(-10);
    const [a, b, c] = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];

    if (key === 'phoneAreaCode') return a;
    // A number input accepts digits only (dashes make the browser reject the value).
    if ((el.type || '').toLowerCase() === 'number') {
      if (ml === 3 || ml === 4) { const seg = phoneSegment(el); return seg === 'area' ? a : seg === 'exchange' ? b : c; }
      return digits;
    }

    // Split phone: typical 3 / 3 / 4 layout
    if (ml === 3 || ml === 4) {
      const seg = phoneSegment(el);
      return seg === 'area' ? a : seg === 'exchange' ? b : c;
    }
    if (ml === 7) return b + c; // exchange + last 4
    if (ml === 10) return digits;

    // Placeholder shows the country-code prefix (e.g., "+1") — input expects national-number
    // digits only; the phone library will format and prepend the prefix itself.
    if (/^\+\d/.test(placeholder)) return digits;

    // Inside a phone-input widget — same deal, send digits only
    if (isInsidePhoneWidget(el)) return digits;

    // Follow the format the placeholder demonstrates.
    if (/^\(\d{3}\)/.test(placeholder)) return `(${a}) ${b}-${c}`;
    if (/^\d{10}$/.test(placeholder)) return digits;

    // Pattern restricts to digits
    // (A pattern of digits only — \d{10}, [0-9]{10} — with no "(", ")", "-" or space in it.)
    if (pattern && /\\d|\[0-9\]/.test(pattern) && !/[()\-\s]/.test(pattern.replace(/\\d|\[0-9\]/g, ''))) {
      return digits;
    }

    // Default: dashed XXX-XXX-XXXX (most widely accepted).
    return `${a}-${b}-${c}`;
  }

  const PHONE_KEYS = ['phone','mobile','homePhone','workPhone','altPhone','fax','emergencyPhone','phoneDigits','phoneDashed','phoneIntl','phoneFormatted','phoneAreaCode'];

  // Returns true if the value was accepted.
  // keepTooLong: "Too short / too long" — an oversize value is never cut to the field's maxlength.
  async function fillPhone(el, key, dataset, mode, keepTooLong = false) {
    if (mode !== 'valid') {
      // Invalid/edge: put the raw payload in as-is (letters, XSS, long strings…).
      let v = String(dataset[key] != null ? dataset[key] : dataset.phone);
      // Same maxlength rule as text fields: edge ignores it; invalid keeps the
      // oversize value 40% of the time.
      if (mode === 'invalid' && el.maxLength > 0 && v.length > el.maxLength && !keepTooLong && Math.random() >= 0.4) {
        v = v.slice(0, el.maxLength);
      }
      return setText(el, v);
    }
    const value = pickPhoneValue(el, key, dataset);
    // Phone-input libraries reformat as you type — feed them digits keystroke by keystroke.
    if (/^\d{10}$/.test(value) && (isInsidePhoneWidget(el) || /^\+\d/.test((el.placeholder || '').trim()))) {
      return fillPhoneInputRobust(el, value);
    }
    // Input masks can swallow or shift digits ("(___) ___-____" eats the first digit of
    // "404-555-0168" as its "(" and shows "(045) 550-168"). Check the digits that landed;
    // if they are wrong, try the formats masks expect, then typing digits.
    const want = value.replace(/\D/g, '');
    const landed = () => el.value.replace(/\D/g, '').endsWith(want);
    if (setText(el, value) && landed()) return true;
    const alts = [];
    if (want.length === 10) alts.push(`(${want.slice(0, 3)}) ${want.slice(3, 6)}-${want.slice(6)}`);
    alts.push(want);
    for (const alt of alts) {
      if (alt === value) continue;
      setText(el, alt);
      if (landed()) return true;
    }
    await typeSlowly(el, want, 22);
    if (landed()) return true;
    // Nothing gave the right number: leave the field empty rather than wrong.
    setText(el, '');
    return false;
  }

  // ---------- Label-based smart fallback ----------
  // For fields we couldn't classify with our standard patterns, generate a value
  // appropriate to the label text. This is what makes "Specialty" / "Department" /
  // "License Number" / "Years of Experience" / etc. fill with relevant data instead
  // of the patient's full name.
  // A social profile the field asks for: its URL, or "@handle" when the field asks for a
  // handle / username. A site named in passing ("Slack (days)", "Suture threads used",
  // "How did you hear about us: Facebook, Google…") is not a profile field: the label must
  // be just the site's name (plus words like "profile" / "URL"), or the text must ask for
  // a link, profile, handle or web address.
  // text: everything known about the field (label, placeholder, name, id — or a page
  // message); label: the field's visible label alone.
  function socialProfile(text, dataset, label) {
    const t = String(text || '').toLowerCase();
    const handle = String(dataset.username || 'testuser').replace(/[^a-z0-9_]/gi, '').slice(0, 15) || 'testuser';
    const asHandle = /handle|user\s*name|@/.test(t) && !/url|link|profile|page/.test(t);
    const asksForProfile = /\burl\b|\blink\b|profile|handle|account|user\s*name|workspace|https?:|www\.|\.com\b/.test(t);
    const PROFILE_WORDS = ['profile', 'profiles', 'url', 'link', 'links', 'handle', 'handles', 'account', 'accounts', 'username', 'user', 'name', 'page', 'id', 'workspace', 'channel',
      'your', 'my', 'the', 'formerly', 'address', 'optional', 'required', 'personal', 'business', 'company', 'work', 'official', 'public', 'social', 'media', 'network', 'team', 'or', 'and'];
    const tokens = String(label || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const team = String(dataset.lastName || 'team').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const sites = [
      { names: ['slack'], re: /\bslack\b/, url: () => `https://${team}-team.slack.com/team/${handle}` },
      { names: ['twitter', 'x'], re: /\btwitter\b|\bx\s*\(\s*twitter|\bx\s+(profile|url|link|handle|account)\b|\bx\.com\b/, url: () => `https://x.com/${handle}` },
      { names: ['facebook', 'fb'], re: /\bfacebook\b|\bfb\b/, url: () => `https://www.facebook.com/${handle}` },
      { names: ['instagram', 'insta'], re: /\binstagram\b|\binsta\b/, url: () => `https://www.instagram.com/${handle}` },
      { names: ['github'], re: /\bgithub\b/, url: () => `https://github.com/${handle}` },
      { names: ['linkedin'], re: /\blinked\s*in\b/, url: () => `https://www.linkedin.com/in/${handle}` },
      { names: ['youtube'], re: /\byoutube\b/, url: () => `https://www.youtube.com/@${handle}` },
      { names: ['tiktok'], re: /\btiktok\b/, url: () => `https://www.tiktok.com/@${handle}` },
      { names: ['threads'], re: /\bthreads\b/, url: () => `https://www.threads.net/@${handle}` },
      { names: ['doximity'], re: /\bdoximity\b/, url: () => `https://www.doximity.com/pub/${handle}` },
    ];
    for (const s of sites) {
      if (!s.re.test(t)) continue;
      const nameOnly = tokens.length > 0 && tokens.some((w) => s.names.includes(w)) &&
        tokens.every((w) => s.names.includes(w) || PROFILE_WORDS.includes(w));
      if (nameOnly || asksForProfile) return asHandle ? '@' + handle : s.url();
    }
    return null;
  }

  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // The Invalid / Edge value for a field nothing recognised: with "Random mix" each field
  // draws its own (the dataset's pool), otherwise the one value of the chosen kind.
  const genericValue = (dataset) => (Array.isArray(dataset._genericPool) && dataset._genericPool.length ? pickOne(dataset._genericPool) : dataset._generic);
  // Edge → "Each field's own limits": 'min' | 'under' | 'max' | 'over', else null.
  const limitOf = (mode, opts) => (mode === 'edge' && /^limit-/.test(String((opts && opts.edgeType) || '')) ? String(opts.edgeType).slice(6) : null);

  function smartValueForLabel(el, dataset, mode) {
    // Edge/invalid: unrecognised fields get the mode's payload, not realistic data.
    if (mode === 'edge' || mode === 'invalid') return genericValue(dataset);
    const labelText = [
      getLabelText(el),
      el.placeholder || '',
      el.name || '',
      el.id || '',
      el.getAttribute('aria-label') || '',
    ].filter(Boolean).join(' ').toLowerCase().trim();
    if (!labelText) return null;

    const tag = el.tagName.toLowerCase();
    const rand = (n) => Math.floor(Math.random() * n);

    // Healthcare-specific
    if (/skills?|expertise|competenc/.test(labelText)) return 'Patient care, Diagnostics, EMR systems, Treatment planning';
    if (/education|degree|alma[\s_-]*mater/.test(labelText)) return 'M.D., Johns Hopkins University, 2010';
    if (/license[\s_-]*(number|#|id|no)?/.test(labelText)) return `MD-${100000 + rand(900000)}`;
    if (/(years?|yrs?)[\s_-]*(of)?[\s_-]*experience|^experience$/.test(labelText)) return String(5 + rand(15));
    if (/hospital|clinic|facility|practice[\s_-]*name/.test(labelText)) return 'General Hospital';
    if (/department|division|\bunit\b|\bteam\b/.test(labelText)) return dataset.specialty || 'Internal Medicine';
    if (/\brole\b|\bpositions?\b|designation|job[\s_-]*role/.test(labelText)) return dataset.jobTitle;
    if (/profession|\bfield\b/.test(labelText)) return dataset.specialty || 'Healthcare';
    // Reasons, by what they are for.
    if (/reason|why\b/.test(labelText)) {
      if (/leav|resign|separation|departure|quit|left\b/.test(labelText)) return pickOne(['Relocated to another city.', 'Accepted a position closer to home.', 'Career advancement opportunity.', 'Contract ended.']);
      if (/terminat|dismiss/.test(labelText)) return 'Position eliminated due to restructuring.';
      if (/cancel/.test(labelText)) return 'Schedule conflict — will reschedule.';
      if (/absence|leave\b|time[\s_-]*off/.test(labelText)) return 'Family medical leave.';
      if (/transfer/.test(labelText)) return 'Closer to family.';
      if (/declin|refus/.test(labelText)) return 'Patient prefers to discuss with family first.';
      return dataset.reasonForVisit;
    }
    if (/purpose/.test(labelText)) return dataset.reasonForVisit;
    if (/symptom|complaint|chief/.test(labelText)) return dataset.symptoms || dataset.chiefComplaint;
    if (/instruction|direction/.test(labelText)) {
      if (/deliver|shipping|package|courier/.test(labelText)) return 'Leave the package at the front desk; call on arrival.';
      if (/medic|dose|dosage|prescri|discharge|care|patient|pharmac/.test(labelText)) return 'Take medication with food. Continue for 14 days.';
      return 'Please call before arriving.';
    }
    if (/surg|procedure|operation/.test(labelText)) return 'Appendectomy (2015); left knee arthroscopy (2019). No complications reported.';
    if (/family/.test(labelText) && /histor/.test(labelText)) return 'Father: hypertension and type 2 diabetes. Mother: hypothyroidism.';
    if (/(medical|past)[\s_-]*history|history/.test(labelText)) return 'No significant medical history.';
    if (/medication|prescription|\brx\b/.test(labelText)) return dataset.medication;

    // "If other, please specify"
    if (/please\s+specify|if\s+other|other\s*\(specify\)|specify\s+other/.test(labelText)) return 'Other — test entry';

    // Communication
    // (A review / feedback text — not "Reviewed By", which names a person.)
    if (/feedback|\breviews?\b|opinion|rating/.test(labelText) && !/\b(reviewed|rated)\s*by\b/.test(labelText)) return 'Excellent service. Highly recommended.';
    if (/comment|\bnotes?\b|remark|message|details?/.test(labelText)) return dataset.notes || dataset.comment;
    if (/about|description|summary|bio(graphy)?/.test(labelText)) return dataset.bio;

    // Identifiers / numbers
    if (/\bpin\b/.test(labelText)) return String(1000 + rand(9000)).slice(0, el.maxLength > 0 ? el.maxLength : 4);
    if (/account[\s_-]*(number|#|id)/.test(labelText)) return `ACC-${100000 + rand(900000)}`;
    if (/^code$|reference[\s_-]*(number|#|id)/.test(labelText)) return `REF-${10000 + rand(90000)}`;
    if (/badge[\s_-]*(number|#|id)/.test(labelText)) return `BDG-${1000 + rand(9000)}`;
    if (/employee[\s_-]*(number|#|id)/.test(labelText)) return `EMP-${10000 + rand(90000)}`;
    if (/tax[\s_-]*(id|number|#)/.test(labelText)) return `${10 + rand(90)}-${1000000 + rand(9000000)}`;

    // Address fragments
    if (/county/.test(labelText)) return dataset.county || 'Maricopa County';
    if (/landmark|\bnear\b/.test(labelText)) return 'Near Central Park';

    // People
    if (/signature|sign[\s_-]*here|e-?sign|signed[\s_-]*by|printed?[\s_-]*name|print[\s_-]*name/.test(labelText)) return dataset.fullName;
    if (/\binitials?\b/.test(labelText)) return dataset.initials || `${String(dataset.firstName || 'T')[0]}${String(dataset.lastName || 'U')[0]}`;
    if (/supervisor|manager|reports?[\s_-]*to|\bhr\b|human[\s_-]*resources|recruiter/.test(labelText)) return dataset.supervisorName || dataset.emergencyName;
    if (/maiden|\bnee\b/.test(labelText)) return dataset.maidenName;
    if (/nickname|preferred[\s_-]*name/.test(labelText)) return dataset.firstName;
    if (/spouse|husband|wife|partner/.test(labelText)) return dataset.emergencyName;
    if (/guardian/.test(labelText)) return dataset.emergencyName;
    if (/contact[\s_-]*(person|name)/.test(labelText)) return dataset.emergencyName;

    // Organizations
    if (/^company$|organization|employer|business[\s_-]*name|\bfirm\b/.test(labelText)) return dataset.company;

    // Web
    if (/website|portfolio|web[\s_-]*page|homepage/.test(labelText)) return dataset.website;
    const social = socialProfile(labelText, dataset, getLabelText(el) || el.getAttribute('aria-label') || el.placeholder || '');
    if (social) return social;
    if (/linkedin|profile[\s_-]*url/.test(labelText)) return `https://linkedin.com/in/${dataset.username}`;

    // Generic with fallbacks
    if (/^name$|full[\s_-]*name|display[\s_-]*name/.test(labelText)) return dataset.fullName;
    if (/\btitle\b/.test(labelText)) return dataset.jobTitle;

    // Textarea fallback — better than empty
    if (tag === 'textarea') return dataset.notes || dataset.bio;

    return null;
  }

  // ---------- A field nothing recognised: a value from its own words and rules ----------
  // Instead of a stand-in text, what the field says it holds ("Claim Number", "Room", "Copay
  // Amount", "Onset Date", "Lab Name") picks the value, and its rules (a number box, a
  // maxlength, a pattern, an example in its placeholder) give the shape. Valid data only.
  function valueFromFieldWords(el, dataset) {
    const raw = [getLabelText(el), el.getAttribute('aria-label'), el.placeholder, el.name, el.id].filter(Boolean).join(' ');
    const words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.[\]]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
    const own = tidy(String(getLabelText(el) || el.getAttribute('aria-label') || '').replace(/\s*[*:]+\s*$/, ''), 60);
    const type = (el.type || '').toLowerCase();
    const numeric = type === 'number' || /^(numeric|decimal)$/.test(el.inputMode || '');
    const max = el.maxLength > 0 ? el.maxLength : Infinity;
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const digits = (n) => Array.from({ length: n }, (_, i) => String(i === 0 ? r(1, 9) : r(0, 9))).join('');
    const LETTERS = 'ABCDEFGHJKMNPQRTUVWXY'; // (no I / L / O / S / Z: never mistaken for digits)
    const letter = () => LETTERS[r(0, LETTERS.length - 1)];
    const has = (re) => re.test(words);
    // The value must fit the box: its maxlength and its pattern.
    const fits = (v) => {
      if (v == null || v === '') return false;
      v = String(v);
      if (v.length > max || (el.minLength > 0 && v.length < el.minLength)) return false;
      if (el.pattern) { try { if (!new RegExp('^(?:' + el.pattern + ')$', 'v').test(v)) return false; } catch (_) { try { if (!new RegExp('^(?:' + el.pattern + ')$').test(v)) return false; } catch (_) { /* unreadable pattern */ } } }
      return true;
    };
    const first = (...vals) => {
      // Each form whole first ("AUTH-12345678", then "AUTH123456"); only if none fits, the first one
      // cut to the box (a phrase at a word's end).
      for (const v of vals) if (fits(v)) return String(v);
      for (const v of vals) {
        if (v == null || String(v).length <= max || max < 2) continue;
        const cut = String(v).slice(0, max).replace(/[\s,;.-]+\S*$/, '') || String(v).slice(0, max);
        if (fits(cut)) return cut;
      }
      return null;
    };
    const iso = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };

    // 1. An example in its placeholder ("e.g. 1EG4-TE5-MK73", "ABC-12345"): the same shape.
    const ex = String(el.placeholder || '').replace(/^\s*(e\.?\s*g\.?|ex(ample)?|like|format)\s*[:.]?\s*/i, '').trim();
    if (/^(?=.*\d)[A-Za-z0-9][A-Za-z0-9\-/ .]{2,22}$/.test(ex) && !/\s.*\s/.test(ex) && !/^[Xx#9*0_\-/ .]+$/.test(ex) && !/\b(enter|type|your|select|search)\b/i.test(ex)) {
      const shaped = ex.replace(/[0-9]/g, () => String(r(0, 9))).replace(/[A-Z]/g, () => letter()).replace(/[a-z]/g, () => letter().toLowerCase());
      const v = first(shaped);
      if (v) return v;
    }
    // A placeholder of only X / # / 9 / 0 with separators ("XXX-XXXX", "###-###"): digits in that shape.
    if (/^[Xx#90](?:[Xx#90\-/ .]{1,22})$/.test(String(el.placeholder || '').trim())) {
      const v = first(String(el.placeholder).trim().replace(/[Xx#90]/g, () => String(r(0, 9))));
      if (v) return v;
    }

    // 2. Identifiers it names.
    if (has(/medicare\s*beneficiary|\bmbi\b|medicare\s*(id|identifier|number|num|no|#)(?![a-z])/)) {
      // CMS format: 1 digit 1-9, letter, letter/digit, digit, letter, letter/digit, digit, 2 letters, 2 digits.
      const L = 'ACDEFGHJKMNPQRTUVWXY', LD = L + '0123456789';
      const p = (s) => s[r(0, s.length - 1)];
      // (The person's own MBI when they are on Medicare — the same in every field and fill.)
      const own = typeof dataset.mbi === 'string' && /^[1-9][A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z]{2}\d{2}$/.test(dataset.mbi) ? dataset.mbi : null;
      const mbi = own || String(r(1, 9)) + p(L) + p(LD) + r(0, 9) + p(L) + p(LD) + r(0, 9) + p(L) + p(L) + r(0, 9) + r(0, 9);
      const v = first(/-/.test(el.placeholder || '') || max === 13 ? `${mbi.slice(0, 4)}-${mbi.slice(4, 7)}-${mbi.slice(7)}` : mbi, mbi);
      if (v) return v;
    }
    if (has(/medicaid/) && has(/\b(id|number|no|#)\b/)) {
      // (The person's own Medicaid ID when they are on Medicaid.)
      const own = typeof dataset.medicaidId === 'string' && dataset.medicaidId ? dataset.medicaidId : null;
      const v = first(...(own ? [own] : []), `${letter()}${letter()}${digits(8)}`, digits(Math.min(10, max)));
      if (v) return v;
    }
    const ID_WORDS = [[/claim/, 'CLM'], [/prior\s*auth|authori[sz]ation|\bauth\b/, 'AUTH'], [/referral/, 'REF'], [/\bcase\b/, 'CASE'], [/\border\b/, 'ORD'],
      [/invoice/, 'INV'], [/encounter|visit/, 'ENC'], [/accession|specimen|sample/, 'ACC'], [/confirmation/, 'CNF'], [/tracking/, 'TRK'], [/ticket/, 'TKT'],
      [/transaction/, 'TXN'], [/batch/, 'BAT'], [/serial/, 'SN'], [/device/, 'DEV'], [/\broom\b/, null], [/\bbed\b/, null]];
    const idWord = has(/\b(id|identifier|number|num|no|code|#|ref)\b/);
    if (idWord) {
      for (const [re, prefix] of ID_WORDS) {
        if (!prefix || !re.test(words)) continue;
        const v = first(`${prefix}-${digits(8)}`, `${prefix}${digits(6)}`, digits(Math.min(8, max)));
        if (v) return v;
      }
    }

    // A number-only box for an identifier ("Account ID" with a numeric keypad): digits.
    if (idWord && numeric) { const v = first(digits(Math.min(8, max)), digits(Math.min(6, max))); if (v) return v; }

    // 3. Numbers.
    const money =has(/amount|cost|price|fee|charge|copay|co-?pay|coinsurance|deductible|balance|payment|paid|salary|wage|income|premium|\$/);
    const number = (lo, hi, decimals = 0) => {
      let n = decimals ? (lo + Math.random() * (hi - lo)).toFixed(decimals) : String(r(lo, hi));
      if (type === 'number') n = String(fitNumber(el, n));
      return first(n);
    };
    if (money) { const v = number(25, 500, 2); if (v) return v; }
    if (has(/percent|percentage|%/)) { const v = number(10, 95); if (v) return v; }
    if (has(/\b(pain|score|scale|rating|level|grade)\b/)) { const v = number(1, 9); if (v) return v; }
    if (has(/\b(minutes?|mins?)\b/)) { const v = first(String(pickOne([15, 30, 45, 60]))); if (v) return v; }
    if (has(/\b(hours?|hrs?)\b/)) { const v = number(1, 8); if (v) return v; }
    if (has(/\b(days?)\b/) && !has(/date/)) { const v = number(1, 30); if (v) return v; }
    if (has(/\b(weeks?|wks?)\b/)) { const v = number(1, 12); if (v) return v; }
    if (has(/\b(months?)\b/) && !has(/date/)) { const v = number(1, 24); if (v) return v; }
    if (has(/\b(years?|yrs?)\b/) && !has(/date|birth/)) { const v = number(1, 20); if (v) return v; }
    if (has(/\b(count|qty|quantity|how many|number of|units?|refills?|visits?|attempts?|times?|frequency)\b/)) { const v = number(1, 5); if (v) return v; }
    if (numeric) { const v = number(1, 99); if (v) return v; }

    // 4. Dates and times it names.
    if (has(/\bdate\b|\bdob\b/)) {
      const off = has(/expir|\bend\b|until|through|terminat|due|next|follow|renew|valid/) ? r(30, 365)
        : has(/onset|start|since|diagnos|last|previous|prior|injury|surgery|admit|admission|issued?|birth/) ? -r(30, 900) : 0;
      const v = first(formatDateFor(el, iso(off)));
      if (v) return v;
    }
    if (has(/\btime\b/) && !has(/zone|\btimes?\s*per\b/)) { const v = first(dataset.appointmentTime, '09:30 AM', '09:30'); if (v) return v; }

    // 5. People and organisations.
    if (has(/\bname\b|\bby\b/) || has(/provider|physician|doctor|\bdr\b|nurse|clinician|prescriber|attending|ordering|referring|therapist|counsel+or/)) {
      if (has(/pharmacy/)) { const v = first(dataset.pharmacy); if (v) return v; }
      if (has(/\blab(oratory)?\b/)) { const v = first(pickOne(['Quest Diagnostics', 'Labcorp', 'BioReference Laboratories'])); if (v) return v; }
      if (has(/hospital|facility|clinic|location|site|center|centre|practice/)) { const v = first(dataset.facility); if (v) return v; }
      if (has(/insur|payer|payor|carrier|\bplan\b/)) { const v = first(has(/plan/) ? dataset.planName : dataset.insuranceCarrier); if (v) return v; }
      if (has(/employer|company|organi[sz]ation|agency|vendor|business|school/)) { const v = first(dataset.company); if (v) return v; }
      if (has(/provider|physician|doctor|\bdr\b|nurse|clinician|prescriber|attending|ordering|referring|therapist|counsel+or|pcp/)) { const v = first(dataset.providerName); if (v) return v; }
      if (has(/contact|emergency|guardian|parent|spouse|caregiver|family|relative|witness|representative|proxy/)) { const v = first(dataset.emergencyName); if (v) return v; }
      // ("Reviewed By", "Completed by", "Staff Name": a person.)
      if (has(/\bname\b|\bby\b/)) { const v = first(dataset.supervisorName, dataset.fullName); if (v) return v; }
    }
    if (has(/pharmacy/)) { const v = first(dataset.pharmacy); if (v) return v; }
    if (has(/\blab(oratory)?\b/) && !has(/result|value|test/)) { const v = first('Quest Diagnostics'); if (v) return v; }

    // 6. Places in a building, and clinical words.
    if (has(/\broom\b/)) { const v = first(`Room ${r(101, 450)}`, String(r(101, 450))); if (v) return v; }
    if (has(/\bbed\b/)) { const v = first(`Bed ${r(1, 4)}`, String(r(1, 4))); if (v) return v; }
    if (has(/\bfloor\b/)) { const v = first(`Floor ${r(1, 6)}`, String(r(1, 6))); if (v) return v; }
    if (has(/\bsuite\b/)) { const v = first(`Suite ${r(100, 450)}`, String(r(100, 450))); if (v) return v; }
    if (has(/\bwing\b|\bward\b/)) { const v = first(pickOne(['North Wing', 'East Wing', 'West Wing'])); if (v) return v; }
    if (has(/\bbuilding\b/)) { const v = first(`Building ${letter()}`); if (v) return v; }
    const CLINICAL = [
      [/icd/, () => dataset.icd10], [/\bcpt\b|hcpcs/, () => dataset.cpt],
      [/diagnos|condition|problem|disease|disorder/, () => dataset.diagnosis], [/allerg/, () => dataset.allergy], [/reaction/, () => pickOne(['Hives', 'Rash', 'Nausea'])],
      [/dosage|\bdose\b|strength/, () => dataset.medicationDose], [/frequency|\bsig\b/, () => dataset.medicationFrequency], [/\broute\b/, () => dataset.medicationRoute],
      [/vaccin|immuni[sz]/, () => dataset.vaccineName], [/\blot\b/, () => dataset.lotNumber], [/medication|\bdrug\b|\brx\b/, () => dataset.medication],
      [/\blab\b|\btest\b/, () => pickOne(['Complete Blood Count (CBC)', 'Basic Metabolic Panel', 'Hemoglobin A1C', 'Lipid Panel'])],
      [/result|finding|impression/, () => 'Within normal limits'], [/\bgoal\b|objective|target/, () => 'Keep blood pressure below 130/80 within 3 months'],
      [/intervention|action\s*plan/, () => 'Weekly nurse phone check-in'], [/barrier/, () => pickOne(['Transportation', 'Cost of medication', 'Work schedule'])],
      [/outcome/, () => 'Improved'], [/care\s*plan|treatment\s*plan|\bplan\b/, () => 'Continue current treatment; follow up in 4 weeks.'],
      [/program|service\s*type|care\s*type/, () => pickOne(['Chronic Care Management', 'Remote Patient Monitoring', 'Transitional Care Management'])],
      [/\bstatus\b/, () => 'Active'], [/priority|urgency/, () => 'Routine'], [/severity|acuity/, () => 'Moderate'], [/\bstage\b/, () => 'Stage 1'],
      [/\bsource\b|referred\s*from|how\s*did\s*you\s*hear/, () => pickOne(['Physician referral', 'Hospital discharge', 'Self-referral'])],
      [/method|\bmode\b|channel|contact\s*preference/, () => pickOne(['Phone', 'Email', 'Text message'])], [/preferred\s*time|best\s*time/, () => 'Morning'],
      [/\brisk\b/, () => 'Low'], [/language/, () => dataset.language], [/relationship/, () => dataset.relationship], [/specialty|speciality/, () => dataset.specialty],
      [/\btitle\b|position|\brole\b|occupation/, () => dataset.jobTitle], [/insur|payer|payor|carrier/, () => dataset.insuranceCarrier],
      [/employer|company|organi[sz]ation|agency/, () => dataset.company], [/hospital|facility|clinic|location|\bsite\b/, () => dataset.facility],
      [/\b(type|category|kind|class)\b/, () => pickOne(['Primary', 'General', 'Standard'])],
    ];
    for (const [re, val] of CLINICAL) { if (has(re)) { const v = first(val()); if (v) return v; } }

    // 7. An identifier it does not name further ("Account Code", "Member Ref"): initials + digits.
    if (idWord) {
      const initials = (own || words).split(/[^A-Za-z]+/).filter((w) => w.length > 1 && !/^(id|identifier|number|num|no|code|ref|the|of|and)$/i.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 3);
      const v = first(initials ? `${initials}-${digits(6)}` : digits(8), digits(Math.min(8, max)), digits(Math.min(6, max)));
      if (v) return v;
    }
    // A yes / no question asked as a text box.
    if (/^\s*(is|are|has|have|does|do|did|was|were|will|can|any)\b/i.test(own) || /\?\s*$/.test(own)) { const v = first('No'); if (v) return v; }
    // 8. Nothing it says is known: its own name, so the result shows which field got what. (No
    // label: its internal name in words — "custom_field1" → "custom field1".)
    const name = own || tidy(String(el.name || el.id || '').split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\d{3,}/g, ''), 40);
    if (name && /[a-z]{2}/i.test(name)) { const v = first(`Sample ${name.toLowerCase()}`, name, name.split(/\s+/)[0]); if (v) return v; }
    return first('Sample text', 'Sample', 'Text', 'A');
  }

  // ---------- Hint resolution for selects (multiple candidates per field) ----------
  // "Month" / "Day" / "Year" dropdowns whose group is about a birth date.
  function dobPartKey(el) {
    const own = (getLabelText(el) || el.getAttribute('aria-label') || el.name || '').trim().toLowerCase();
    const part = /^(birth\s*)?(month|mm|mon)\b/.test(own) || /(^|_)month$/.test(el.name || '') ? 'dobMonth'
      : /^(birth\s*)?(day|dd)\b/.test(own) || /(^|_)day$/.test(el.name || '') ? 'dobDay'
      : /^(birth\s*)?(year|yyyy|yr)\b/.test(own) || /(^|_)year$/.test(el.name || '') ? 'dobYear' : null;
    if (!part) return null;
    const group = el.closest('[role="group"], fieldset, .f, .form-group, .field') || el.parentElement;
    const ctx = [group && group.getAttribute('aria-labelledby') && (document.getElementById(group.getAttribute('aria-labelledby')) || {}).textContent,
      group && group.querySelector('legend, label, .lbl') && group.querySelector('legend, label, .lbl').textContent, el.name, el.id].join(' ').toLowerCase();
    if (/exp|expir|card|valid/.test(ctx)) return null;
    return /birth|dob|born/.test(ctx) ? part : null;
  }

  function getSelectHints(key, dataset) {
    if (!key) return [];
    if (key === 'dobMonth' || key === 'dobDay' || key === 'dobYear') {
      const iso = String(toISODate(dataset.dob) || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!iso) return [];
      const [, y, mo, d] = iso;
      const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if (key === 'dobMonth') return [mo, String(+mo), names[+mo - 1], names[+mo - 1].slice(0, 3)];
      if (key === 'dobDay') return [d, String(+d)];
      return [y];
    }
    const single = dataset[key];
    const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
    const map = {
      state:        [dataset.stateCode, dataset.state, dataset.stateName],
      stateName:    [dataset.stateName, dataset.state, dataset.stateCode],
      country:      [dataset.country, dataset.countryCode, 'United States', 'USA', 'US'],
      countryCode:  [dataset.countryCode, dataset.country, 'US', 'United States'],
      gender:       [dataset.gender, dataset.genderShort, dataset.sex],
      sex:          [dataset.sex, dataset.gender, dataset.genderShort],
      bloodType:    [dataset.bloodType],
      race:         [dataset.race],
      ethnicity:    [dataset.ethnicity],
      maritalStatus:[dataset.maritalStatus],
      language:     [dataset.language, 'English'],
      preferredLanguage: [dataset.preferredLanguage, 'English'],
      pronouns:     [dataset.pronouns],
      // (A child's parent: "Mother" / "Father", or "Parent" / "Guardian" where the list says so.)
      relationship: [dataset.relationship, ...listOf(dataset.emergencyRelationshipHints), 'Self'],
      relationshipToSubscriber: [dataset.relationshipToSubscriber, 'Self'],
      emergencyRelationship: [dataset.emergencyRelationship, ...listOf(dataset.emergencyRelationshipHints), 'Spouse'],
      insuranceCarrier: [dataset.insuranceCarrier],
      // (A self-pay patient: "Self Pay", "Uninsured"…)
      insuranceType: [dataset.insuranceType, ...listOf(dataset.insuranceTypeHints)],
      specialty:    [dataset.specialty],
      pharmacy:     [dataset.pharmacy],
      allergy:      [dataset.allergy],
      bp:           [dataset.bp],
      ccBrand:      [dataset.ccBrand],
      ccExpMonth:   [dataset.ccExpMonth, String(Number(dataset.ccExpMonth))],
      ccExpYear:    [dataset.ccExpYear, dataset.ccExpYearShort],
      prefix:       [dataset.prefix],
      // IANA id, then the names time-zone lists use ("Eastern Time (US & Canada)",
      // "(GMT-07:00) Arizona", "US/Mountain", "EST"…).
      timeZone:     [dataset.timeZone, ...(dataset.timeZoneNames || [])],
      suffix:       [dataset.suffix],
    };
    return map[key] || [single];
  }

  // ---------- Generic value picking ----------

  const DATE_KEYS = ['dob', 'subscriberDob', 'dateOfService', 'appointmentDate', 'effectiveDate', 'terminationDate', 'today', 'admissionDate', 'referralDate'];

  // Which dataset date a date-typed input gets: its own date key, the appointment
  // date for an appointment date+time input, otherwise today (never a guessed DOB).
  function dateKeyFor(key) {
    if (DATE_KEYS.includes(key)) return key;
    if (key === 'appointmentTime') return 'appointmentDate';
    return 'today';
  }

  // Render an ISO date in the format the field shows in its placeholder
  // (yyyy-mm-dd, dd/mm/yyyy, mm-dd-yyyy, mm/dd/yy…); US MM/DD/YYYY by default.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function formatDateFor(el, iso) {
    const [y, m, d] = iso.split('-');
    // A date already in the box shows the format its date picker expects
    // ("29 Sep 2026", "Sep 29, 2026", "29/09/2026", "2026-09-29"…) — copy it.
    const sample = typeof el.value === 'string' ? el.value.trim() : '';
    // Full names when the sample's is ("June", "July", "September"), short otherwise ("Sep", "Sept").
    const monthName = (tok) => {
      const n = MONTHS[+m - 1];
      const full = tok.length > 4 || (tok.length === 4 && MONTHS.some((x) => x.toLowerCase() === tok.toLowerCase()));
      return full ? n : n.slice(0, 3);
    };
    let mm;
    if ((mm = sample.match(/^(\d{1,2}) ([A-Za-z]{3,})\.? (\d{4})$/))) return `${mm[1].length === 2 ? d : +d} ${monthName(mm[2])} ${y}`;
    if ((mm = sample.match(/^([A-Za-z]{3,})\.? (\d{1,2}), (\d{4})$/))) return `${monthName(mm[1])} ${mm[2].length === 2 ? d : +d}, ${y}`;
    if ((mm = sample.match(/^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})$/))) {
      const [, a, sep, b] = mm;
      if (a.length === 4) return [y, m, d].join(sep);
      if (+a > 12) return [d, m, y].join(sep); // day first
      if (+b > 12) return [m, d, y].join(sep); // month first
    }
    const ph = (el.placeholder || el.getAttribute('data-format') || el.getAttribute('data-date-format') || '').toLowerCase();
    // Month and year only ("MM/YYYY", "YYYY-MM", "MM/YY").
    const my = ph.trim().match(/^(m{1,2}|y{2,4})([-\/. ])(y{2,4}|m{1,2})$/);
    if (my && my[1][0] !== my[3][0]) {
      const part = (tok) => (tok[0] === 'y' ? (tok.length === 2 ? y.slice(2) : y) : m);
      return [my[1], my[3]].map(part).join(my[2]);
    }
    const f = ph.match(/(y{2,4}|m{1,2}|d{1,2})([-\/. ])(y{2,4}|m{1,2}|d{1,2})\2(y{2,4}|m{1,2}|d{1,2})/);
    // No format shown: flatpickr, Ant Design and Element Plus pickers read YYYY-MM-DD by
    // default; everything else gets the US MM/DD/YYYY.
    if (!f && (el.classList.contains('flatpickr-input') || el.closest('.ant-picker, .el-date-editor'))) return `${y}-${m}-${d}`;
    if (!f) return `${m}/${d}/${y}`;
    const part = (tok) => tok[0] === 'y' ? (tok.length === 2 ? y.slice(2) : y) : tok[0] === 'm' ? m : d;
    return [f[1], f[3], f[4]].map(part).join(f[2]);
  }

  // Returns null for an unrecognised plain-text field so the caller can use the
  // label-based fallback (never the patient's full name — see fillForm).
  // How often each key was used in this fill (see "Repeated rows") — and which row each field
  // is, so a field filled again (the page emptied it) keeps its own row's value.
  let keyUses = new Map();
  let keyUseOf = new WeakMap();

  // ---------- Passwords ----------
  // One password per form, so "Confirm password" always matches. It is the
  // team password (Settings, default Admin@1234) unless a field's own rules need a variant.
  // One password per form (a page can hold a sign-up and a change-password form).
  let formPasswords = new Map();
  const passwordScope = (el) => el.form || el.closest('form, [role="dialog"], dialog') || document;

  // The password rule a field declares: minlength, maxlength, pattern.
  function passwordFits(el, pw) {
    if (!pw) return false;
    if (el.minLength > 0 && pw.length < el.minLength) return false;
    if (el.maxLength > 0 && pw.length > el.maxLength) return false;
    if (el.pattern) {
      for (const flags of ['v', 'u', '']) {
        try { return new RegExp('^(?:' + el.pattern + ')$', flags).test(pw); } catch (_) { /* try the next flags */ }
      }
    }
    return true;
  }

  // Variants of the base password, closest first: longer / shorter to fit the length rule,
  // then other strong, memorable passwords (for "too common" / "can't contain admin").
  function passwordVariants(base, dataset, min = 0, max = Infinity) {
    const out = [];
    const add = (p) => { if (p && !out.includes(p)) out.push(p); };
    const fit = (p) => {
      let t = p;
      for (let i = 0; t.length < min; i++) t += '5678901234'[i % 10];
      if (t.length > max) {
        // Shorten but keep an upper, a lower, a digit and a symbol.
        t = t.slice(0, Math.max(4, max));
        if (!/[A-Z]/.test(t)) t = 'A' + t.slice(1);
        if (!/[a-z]/.test(t)) t = t.slice(0, 1) + 'a' + t.slice(2);
        if (!/\d/.test(t)) t = t.slice(0, -1) + '1';
        if (!/[^A-Za-z0-9]/.test(t)) t = t.slice(0, -2) + '@' + t.slice(-1);
      }
      return t;
    };
    for (const p of [base, 'Welcome@2468', 'Secure#Test2468', dataset.passwordRandom, 'QaUser!97531']) if (p) add(fit(p));
    // For fields that allow letters and digits only: the same without symbols.
    for (const p of [base, 'Welcome2468', 'SecureTest2468']) if (p) add(fit(String(p).replace(/[^A-Za-z0-9]/g, '')));
    return out;
  }

  // The length a password pattern asks for: its last {n,m} ("…{12,}", "[A-Za-z0-9]{8,16}").
  function patternLength(pattern) {
    const m = String(pattern || '').replace(/\(\?[=!][^)]*\)/g, '').match(/\{(\d+)(?:,(\d*))?\}\s*\)?\s*\$?\s*$/);
    if (!m) return {};
    return { min: Number(m[1]), max: m[2] === undefined ? Number(m[1]) : m[2] === '' ? Infinity : Number(m[2]) };
  }

  function passwordFor(el, dataset) {
    const scope = passwordScope(el);
    const chosen = formPasswords.get(scope);
    if (chosen && passwordFits(el, chosen)) return chosen;
    const base = chosen || dataset.password || 'Admin@1234';
    const fromPattern = patternLength(el.pattern);
    const min = Math.max(el.minLength > 0 ? el.minLength : 0, fromPattern.min || 0);
    const max = Math.min(el.maxLength > 0 ? el.maxLength : Infinity, fromPattern.max || Infinity);
    const pick = passwordVariants(base, dataset, min, max).find((p) => passwordFits(el, p)) || base;
    if (!chosen) formPasswords.set(scope, pick);
    return pick;
  }

  function pickValueForField(el, key, dataset, mode) {
    // (A field set to a Medicare / Medicaid ID: the patient's own, else one made for it.)
    if (key === 'mbi' && mode === 'valid') return dataset.mbi || makeMBI();
    if (key === 'medicaidId' && mode === 'valid') return dataset.medicaidId || makeMedicaidId();
    const type = (el.type || '').toLowerCase();
    const tag = el.tagName.toLowerCase();

    if (mode === 'valid' && (type === 'password' || key === 'password' || key === 'passwordConfirm')) return passwordFor(el, dataset);

    // Native date-family inputs need ISO values (invalid dates are converted too, so
    // "range" violations such as a 2099 effective date still get in).
    // Week pickers take "YYYY-Www" (ISO week): this week.
    if (type === 'week') {
      // Invalid data: a week far in the future (a week box cannot hold a malformed week).
      if (mode === 'invalid') return '2099-W01';
      const t = new Date(); const d = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const wk = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
    }
    // A card-expiry month picker: the card's MM/YY as YYYY-MM.
    if (type === 'month' && key === 'ccExp' && /^\d{2}\/\d{2}$/.test(String(dataset.ccExp || ''))) {
      const [mm, yy] = String(dataset.ccExp).split('/');
      return `20${yy}-${mm}`;
    }
    if (type === 'date' || type === 'datetime-local' || type === 'month') {
      const v = toISODate(dataset[dateKeyFor(key)] ?? dataset.today);
      if (type === 'datetime-local' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return `${v}T${mode === 'valid' ? dataset.appointmentTime24 || '10:30' : '12:00'}`;
      }
      if (type === 'month' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(0, 7);
      return v;
    }
    if (type === 'time') {
      // Native time inputs take 24-hour "HH:MM" (valid data: within the field's own hours and
      // on its step, e.g. half-hour slots); "3:00 AM" is converted so an out-of-hours
      // (range-invalid) time still gets in.
      if (mode === 'valid') return fitTime(el, dataset.appointmentTime24 || '10:30');
      // Invalid data: a time box cannot hold "25:61", so an out-of-hours time (3:00 AM).
      const t = to24h(dataset.appointmentTime ?? dataset._generic);
      const ok = /^(\d{2}):(\d{2})$/.exec(String(t));
      return ok && +ok[1] < 24 && +ok[2] < 60 ? t : '03:00';
    }
    // A time typed as text: the way the box shows it ("hh:mm aa" = 09:30 AM, "HH:MM" = 24-hour).
    if (key === 'appointmentTime' && mode === 'valid' && dataset.appointmentTime) {
      const hint = `${el.placeholder || ''} ${getLabelText(el)} ${el.getAttribute('data-format') || ''}`;
      if (/\bHH\s*:\s*(mm|MM)\b/.test(hint) && !/\b(a|aa|tt|am\/pm|am|pm)\b/i.test(hint.replace(/\bHH\s*:\s*(mm|MM)\b/, '')) || /24[\s-]*h(our)?/i.test(hint)) {
        return dataset.appointmentTime24 || to24h(dataset.appointmentTime);
      }
      if (/\bhh\s*:\s*mm\b/i.test(hint)) return String(dataset.appointmentTime).replace(/^(\d):/, '0$1:');
    }

    // Text date fields: any REAL date (valid, or out-of-range like 2099) follows the
    // placeholder's format; a malformed one ("13/45/2024") is entered as-is.
    if (DATE_KEYS.includes(key) && dataset[key]) {
      const iso = toISODate(dataset[key]);
      return isRealDate(iso) ? formatDateFor(el, iso) : dataset[key];
    }

    // Split date of birth (Month / Day / Year boxes): each box gets its own part.
    if (key === 'dobMonth' || key === 'dobDay' || key === 'dobYear') {
      const iso = String(toISODate(dataset.dob) || '');
      const p = isRealDate(iso) && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!p) return mode === 'edge' ? genericValue(dataset) : { dobMonth: '13', dobDay: '32', dobYear: '2099' }[key];
      if (key === 'dobMonth') return p[2];
      if (key === 'dobDay') return p[3];
      return el.maxLength === 2 || /^yy$/i.test((el.placeholder || '').trim()) ? p[1].slice(2) : p[1];
    }

    // A plain "Height" number box: inches, or centimetres when its unit says cm.
    if (key === 'height' && type === 'number' && dataset.heightInches) {
      const box = el.parentElement;
      const unit = box && Array.from(box.querySelectorAll('select, [aria-pressed="true"], [aria-checked="true"]'))
        .map((u) => (u.tagName === 'SELECT' ? (u.options[u.selectedIndex] || {}).textContent : u.textContent) || '').join(' ');
      const v = /\bcm\b/i.test(unit || '') ? dataset.heightCm : dataset.heightInches;
      return mode === 'valid' ? fitNumber(el, v) : v;
    }
    // "Height (in)" on its own means the whole height in inches; only next to a feet
    // box is it the inches part (5 ft + 7 in).
    if (key === 'heightIn' && dataset.heightInches) {
      const scope = el.form || el.closest('form, [role="dialog"], main') || document;
      const hasFeet = Array.from(scope.querySelectorAll('input, select')).some((i) => i !== el &&
        /\b(ft|feet)\b/i.test(getLabelText(i) + ' ' + (i.name || '') + ' ' + (i.placeholder || '')));
      if (!hasFeet) return type === 'number' && mode === 'valid' ? fitNumber(el, dataset.heightInches) : dataset.heightInches;
    }

    // Repeated rows (immunizations, medications): the 2nd, 3rd… get different values.
    if (mode === 'valid' && key && dataset.alternates && Array.isArray(dataset.alternates[key])) {
      let n = el ? keyUseOf.get(el) : undefined;
      if (n === undefined) {
        n = keyUses.get(key) || 0;
        keyUses.set(key, n + 1);
        if (el) keyUseOf.set(el, n);
      }
      const alts = dataset.alternates[key]; // (never the first row's value; rows of one drug stay aligned)
      if (n > 0 && alts.length) return alts[(n - 1) % alts.length];
    }

    // A provider's bio ("Provider Bio", "About the physician"): their clinical title and specialty.
    if (key === 'bio' && mode === 'valid' && dataset.providerBio &&
        /provider|physician|doctor|clinician|practitioner|nurse|therapist|prescriber|\bmd\b|\bnp\b|\bpa\b/i.test(`${getLabelText(el)} ${el.name || ''} ${el.id || ''} ${el.placeholder || ''}`)) {
      return dataset.providerBio;
    }
    // A web address or handle for a named site (LinkedIn, GitHub, Twitter / X…): that site's.
    if (mode === 'valid' && (key === 'url' || key === 'website' || key === 'username')) {
      const own = getLabelText(el) || el.getAttribute('aria-label') || el.placeholder || '';
      const social = socialProfile([own, el.placeholder, el.name, el.id].filter(Boolean).join(' '), dataset, own);
      if (social) return social;
    }

    // An SSN box that shows or allows 9 characters without dashes ("XXXXXXXXX", maxlength 9, a
    // number box) takes the 9 digits; otherwise 123-45-6789. A box the page emptied gets the other
    // form when it is filled again (a page may drop the form it does not accept without a word).
    if (key === 'ssn' && mode === 'valid' && dataset.ssn) {
      const ph = (el.placeholder || '').trim();
      const digits = el.maxLength === 9 || type === 'number' || /^[Xx#9*0_]{9}$/.test(ph);
      const dashed = String(dataset.ssn);
      return (digits !== ssnOtherForm.has(el)) ? dashed.replace(/\D/g, '') : dashed;
    }

    if (key && dataset[key] != null) {
      // Valid numbers must respect the input's own min / max / step.
      if (type === 'number' && mode === 'valid') return fitNumber(el, dataset[key]);
      return dataset[key];
    }

    // An unrecognised text area: its label decides (the caller's label-based answers:
    // surgical history, delivery instructions, reason for leaving…).
    if (tag === 'textarea') return null;
    if (type === 'email') return dataset.email;
    if (type === 'url') return dataset.url;
    if (type === 'password') return dataset.password;
    if (type === 'number') return mode === 'valid' ? fitNumber(el, dataset.number) : genericValue(dataset);
    if (type === 'color') return '#3fb950';
    if (type === 'range') {
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      return fitNumber(el, (min + max) / 2);
    }
    return null;
  }

  // A slider's starting value: the middle of its range, on its step.
  function fitNumberPlain(el, v) {
    const min = Number(el.min || 0);
    const step = Number(el.step) > 0 ? Number(el.step) : 1;
    return min + Math.round((v - min) / step) * step;
  }

  // Clamp to [min, max] and snap to step (defaults 1–100, step 1).
  function fitNumber(el, v) {
    let n = Number(v);
    // An id written with separators ("12-3456789" tax ID, "(602) 555-…") in a number box:
    // its digits.
    if (!Number.isFinite(n)) {
      const digits = String(v == null ? '' : v).replace(/[^\d.]/g, '');
      if (digits && Number.isFinite(Number(digits))) { v = digits; n = Number(digits); } else n = 1;
    }
    const min = el.min !== '' && Number.isFinite(Number(el.min)) ? Number(el.min) : null;
    const max = el.max !== '' && Number.isFinite(Number(el.max)) ? Number(el.max) : null;
    // Unconstrained integer: keep as-is (preserves leading zeros, e.g. ZIP 02108).
    if (min == null && max == null && ['', '1', 'any'].includes(el.step || '') && /^-?\d+$/.test(String(v))) {
      return String(v);
    }
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    const step = el.step === 'any' ? null : (Number(el.step) > 0 ? Number(el.step) : 1);
    if (step) {
      const base = min != null ? min : 0;
      n = base + Math.round((n - base) / step) * step;
      if (max != null && n > max) n -= step;
      const decimals = (String(step).split('.')[1] || '').length;
      return n.toFixed(decimals);
    }
    return String(n);
  }

  // The checkboxes that form one question with `el`: same name, or siblings in the
  // nearest container holding several checkboxes and no other kind of field.
  function checkboxGroupOf(el) {
    if (el.name) {
      const same = Array.from((el.form || document).querySelectorAll('input[type=checkbox]')).filter((c) => c.name === el.name);
      if (same.length >= 2) return same;
    }
    let a = el.parentElement;
    for (let d = 0; a && d < 3; d++, a = a.parentElement) {
      if (Array.from(a.querySelectorAll(FIELD_SELECTOR)).some((f) => f.type !== 'checkbox')) return [el];
      const boxes = Array.from(a.querySelectorAll('input[type=checkbox]'));
      if (boxes.length >= 2) return boxes;
    }
    return [el];
  }

  function radioGroupOf(el) {
    if (el.name) {
      const scope = el.form || document;
      return Array.from(scope.querySelectorAll('input[type=radio]')).filter((r) => r.name === el.name);
    }
    // No name (Vue v-model, React-controlled radios): the other nameless radios in its
    // radio group / fieldset, or in the nearest box that holds only radios.
    const nameless = (box) => Array.from(box.querySelectorAll('input[type=radio]')).filter((r) => !r.name);
    const box = el.closest('[role="radiogroup"], fieldset');
    if (box) {
      const g = nameless(box);
      if (g.length >= 2 && g.includes(el)) return g;
    }
    for (let a = el.parentElement, d = 0; a && a !== document.body && d < 4; a = a.parentElement, d++) {
      if (Array.from(a.querySelectorAll(FIELD_SELECTOR)).some((f) => f.type !== 'radio')) break;
      const g = nameless(a);
      if (g.length >= 2) return g;
    }
    return [el];
  }

  // "Already filled" as a user would see it: a ticked checkbox, a radio group with a
  // choice, a select showing a real option (not "Select…"), or non-blank text.
  // True if a date string is today's date (in any common format).
  function isTodayString(v) {
    const s = String(v || '').trim();
    // (A date input's YYYY-MM-DD is a calendar day: read as local, not as UTC midnight — which
    // is the day before everywhere west of UTC.)
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const t = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]).getTime() : Date.parse(s);
    if (Number.isNaN(t)) return false;
    const a = new Date(t);
    const n = new Date();
    return a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth() && a.getDate() === n.getDate();
  }

  function hasValue(el, key) {
    if (el.type === 'checkbox') return el.checked;
    // Sliders and colour pickers always hold a value; only a changed one is data.
    // (With no value attribute a slider starts in the middle and a colour at black.)
    if (el.type === 'range' || el.type === 'color') {
      if (el.hasAttribute('value')) return el.value !== el.defaultValue;
      if (el.type === 'color') return el.value.toLowerCase() !== '#000000';
      const min = Number(el.min || 0), max = Number(el.max || 100);
      return Number(el.value) !== fitNumberPlain(el, min + (max - min) / 2);
    }
    // Date pickers often pre-fill today as a default; a date of birth can never be
    // today, so that is a placeholder, not data the user entered.
    if (key === 'dob' && isTodayString(el.value)) return false;
    if (el.type === 'radio') return radioGroupOf(el).some((r) => r.checked);
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      if (!o || o.value === '') return false;
      // "None" / "N/A" is a saved answer in a form that already held data (an edit form); in
      // a form that was empty it is only the list's default, as before.
      if (isPlaceholderText(o.textContent) &&
          !(/^\s*(none|n\/a)\b/i.test(o.textContent) && emptyAtStart && !emptyAtStart.has(formScopeOf(el)))) return false;
      // Showing its first option only because nothing was chosen (no option is marked
      // selected), in a form that was empty when the fill started: the browser's default
      // ("Alabama"), not a choice. In a form that already held data it may be a saved
      // choice, and is left alone.
      // (Only for real lists — states, countries — not a short unit switch like in / cm,
      // whose first option is a deliberate default.)
      if (!el.multiple && el.selectedIndex === 0 && el.options.length >= 5 && !Array.from(el.options).some((x) => x.defaultSelected) &&
          emptyAtStart && emptyAtStart.has(formScopeOf(el))) return false;
      return true;
    }
    if (el.value == null || String(el.value).trim() === '') return false;
    return !isEmptyTemplate(el, key);
  }

  // What an input mask or phone widget shows while nothing was entered: its template
  // ("(___) ___-____", "__/__/____", "mm/dd/yyyy") or the dial code alone ("+1", "+44 ").
  function isEmptyTemplate(el, key) {
    const v = String(el.value || '').trim();
    if (/_/.test(v) && /^[\s_()\-.\/:+#*]*$/.test(v)) return true;
    if (/^(dd|mm|yyyy|yy|hh)([\s\/.\-:](dd|mm|yyyy|yy|hh|ss))+$/i.test(v)) return true;
    const phoneish = PHONE_KEYS.includes(key) || (el.type || '').toLowerCase() === 'tel' || isInsidePhoneWidget(el);
    return phoneish && /^\+\d{1,4}[\s\-(]*$/.test(v);
  }

  // Forms (or dialogs / the page) whose text fields were all empty when the fill started.
  let emptyAtStart = null;
  const formScopeOf = (el) => el.form || el.closest('form, [role="dialog"], dialog') || document.body;
  function noteEmptyForms(fields) {
    const withData = new Set();
    const all = new Set();
    for (const f of fields) {
      const scope = formScopeOf(f);
      all.add(scope);
      const type = (f.type || '').toLowerCase();
      if ((f.tagName === 'TEXTAREA' || (f.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'hidden', 'file'].includes(type))) &&
          String(f.value || '').trim() !== '' && !isEmptyTemplate(f, null)) withData.add(scope);
    }
    emptyAtStart = new Set(Array.from(all).filter((s) => !withData.has(s)));
  }

  // ---------- Custom dropdown filling ----------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Placeholder-text patterns ("Select X", "Choose Y", "----")
  const PLACEHOLDER_RE = /^\s*(?:(?:select|choose|please[\s_-]*select|pick)\b|--)/i;

  function classifyCustomDropdown(el) {
    const parts = [
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-testid') || '',
      el.getAttribute('data-test') || '',
      el.getAttribute('data-field') || '',
      el.id || '',
      el.getAttribute('name') || '',
      el.querySelector?.('.react-select__placeholder')?.textContent || '',
      el.querySelector?.('.ant-select-selection-placeholder')?.textContent || '',
      el.querySelector?.('.MuiSelect-select')?.textContent || '',
      // Trigger inner text (often the placeholder like "Select Country")
      (el.textContent || '').slice(0, 120),
    ];

    // The visible label decides (see resolveKey); the attributes and current text only
    // help when there is no label.
    return resolveKey(dropdownLabelText(el), parts);
  }

  // A custom dropdown's visible label: aria-labelledby, a label inside the component
  // (MUI), the label of its form-field wrapper (Angular Material mat-form-field, MUI
  // FormControl), else the closest label before it or a label column.
  function dropdownLabelText(el) {
    // aria-labelledby often names the widget's own text too ("Department Select…"): only
    // the parts outside the widget are its label.
    const labelledBy = (n) => (n.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
      .map((id) => document.getElementById(id)).filter((x) => x && x !== el && !el.contains(x))
      .map((x) => x.textContent || '').join(' ').trim();
    const by = labelledBy(el);
    if (by) return by;
    for (const n of el.querySelectorAll ? el.querySelectorAll('[aria-labelledby]') : []) {
      const t = labelledBy(n);
      if (t) return t;
    }
    // <label for="…"> pointing at the widget or an input inside it (Element Plus, Vuetify).
    for (const n of [el, ...(el.querySelectorAll ? el.querySelectorAll('[id]') : [])]) {
      if (!n.id) continue;
      const l = document.querySelector(`label[for="${cssEscape(n.id)}"]`);
      if (l && !el.contains(l) && l.textContent.trim()) return l.textContent.trim();
    }
    // The <select> a widget replaced (Select2, Tom Select) keeps the label.
    const backing = backingSelectOf(el);
    if (backing && backing.id) {
      const l = document.querySelector(`label[for="${cssEscape(backing.id)}"]`);
      if (l && l.textContent.trim()) return l.textContent.trim();
    }
    const inner = el.querySelector?.('label, mat-label, legend, [class*="InputLabel" i]');
    if (inner && inner.textContent.trim()) return inner.textContent.trim();
    const wrap = el.closest('mat-form-field, .mat-mdc-form-field, .mat-form-field, .MuiFormControl-root, [class*="form-field" i], [class*="FormField"]');
    const wrapLabel = wrap && wrap.querySelector('label, mat-label, legend, [class*="InputLabel" i], [class*="floating-label" i]');
    if (wrapLabel && wrapLabel.textContent.trim()) return wrapLabel.textContent.trim();
    return nearestPrecedingLabel(el) || precedingColumnText(el, Array.from(el.querySelectorAll?.(FIELD_SELECTOR) || []).concat(el));
  }

  // A dropdown wrapper's visible text minus any <label>/<legend> inside it (MUI puts
  // the field label inside .MuiAutocomplete-root, which is not a value).
  // Also drops screen-reader-only announcements ("option Panipat, selected.") that
  // libraries keep inside the component.
  // Arrow glyphs drawn as text ("▾") are never part of a value; "×" / "‹" / "›" only as a
  // close mark standing alone at the start or end ("Chip ×"), not inside a value such as
  // "10×20 cm" or "2 × 4".
  const ARROW_GLYPHS_RE = /[\u25B2-\u25BF\u2304\u2303\u23F4-\u23F7\u2B9F\u276F\u276E]/g;
  const LONE_MARKS_RE = /^\s*[\u00D7\u2715\u2716\u2039\u203A](?=\s|$)|\s[\u00D7\u2715\u2716\u2039\u203A]\s*$/g;
  const stripGlyphs = (t) => String(t).replace(ARROW_GLYPHS_RE, '').replace(LONE_MARKS_RE, '');
  const LIST_IN_FIELD_SEL = '[role="listbox"], .ant-select-dropdown, .rc-virtual-list, .choices__list--dropdown, .select2-dropdown, .ts-dropdown, .p-dropdown-panel';
  const NON_VALUE_SEL = 'label, legend, [class*="InputLabel" i], [class*="floating-label" i], [class*="a11yText" i], [aria-live], .sr-only, .visually-hidden, [class*="VisuallyHidden" i], ' +
    // remove / clear marks of the chosen values (Select2, Tom Select, MUI, Ant, Choices, Element, Vuetify)
    '.select2-selection__choice__remove, .select2-selection__clear, .ts-control .remove, .clear-button, [class*="clear-indicator" i], [class*="clearIndicator" i], [class*="ClearIndicator"], .MuiChip-deleteIcon, .MuiAutocomplete-clearIndicator, .choices__button, .el-tag__close, .ant-select-selection-item-remove, .ant-select-clear, .v-chip__close, ' +
    // the native <select> a widget keeps hidden inside itself (Choices.js): its text repeats the value
    'select, ' + LIST_IN_FIELD_SEL;
  // The text a dropdown shows, without a list drawn inside it (open or kept hidden — Ant Design
  // with its list next to the field): every option's text would read as its value.
  function valueText(el) {
    if (!el.querySelector || !el.querySelector(LIST_IN_FIELD_SEL)) return (el.textContent || '').trim();
    const clone = el.cloneNode(true);
    clone.querySelectorAll(LIST_IN_FIELD_SEL).forEach((n) => n.remove());
    return (clone.textContent || '').trim();
  }
  function textWithoutLabels(el) {
    if (!el.querySelector || !el.querySelector(NON_VALUE_SEL)) return stripGlyphs(el.textContent || '').trim();
    const clone = el.cloneNode(true);
    clone.querySelectorAll(NON_VALUE_SEL).forEach((n) => n.remove());
    return stripGlyphs(clone.textContent || '').trim();
  }

  function isCustomDropdownFilled(el) {
    // A read-only text box trigger shows its choice(s) as its value.
    if (el.tagName === 'INPUT') return !!String(el.value || '').trim();
    const epHolder = el.querySelector?.('.el-select__placeholder');
    if (epHolder) return !epHolder.classList.contains('is-transparent') && !!(epHolder.textContent || '').trim();
    // Showing its placeholder element ("Tags Mode", "Choose…", any wording) = empty.
    const ph = el.querySelector?.('[class*="placeholder" i]');
    if (ph && (ph.textContent || '').trim() && isShown(ph)) return false;
    // A value typed/selected into the dropdown's own input (Autocomplete, readonly-input selects).
    const input = el.querySelector?.('input:not([type=hidden])');
    if (input && String(input.value || '').trim()) return true;
    if (input && !textWithoutLabels(el)) return false;

    // React-Select: explicit placeholder element means empty
    if (el.querySelector?.('.react-select__placeholder')) return false;
    if (el.querySelector?.('.react-select__single-value, .react-select__multi-value')) return true;

    // Choices.js: picked items vs its (hidden) list of every option.
    if (el.matches?.('.choices, .choices__inner') || el.querySelector?.('.choices__inner')) {
      return !!Array.from(el.querySelectorAll('.choices__list--multiple .choices__item, .choices__list--single .choices__item'))
        .some((i) => !i.classList.contains('choices__placeholder') && i.textContent.trim());
    }

    // Ant Design: placeholder element vs item
    if (el.querySelector?.('.ant-select-selection-placeholder')) return false;
    if (el.querySelector?.('.ant-select-selection-item')) {
      const t = el.querySelector('.ant-select-selection-item').textContent.trim();
      if (t) return true;
    }

    // MUI Select: an empty MuiSelect-select usually contains a zero-width space
    if (el.classList?.contains('MuiSelect-select')) {
      const txt = (el.textContent || '').replace(/​/g, '').trim();
      if (!txt) return false;
      if (PLACEHOLDER_RE.test(txt)) return false;
      return true;
    }

    // Generic: if the visible text (not counting its label) is empty or a
    // "Select X" placeholder, treat as empty.
    const text = textWithoutLabels(el);
    if (!text) return false;
    if (PLACEHOLDER_RE.test(text)) return false;
    return true;
  }

  // After opening a dropdown, find clickable options that just became visible.
  // Looks first inside known popup containers; falls back to a doc-wide scan.
  // The visible popup a dropdown points to via aria-controls / aria-owns, if any.
  // The link may sit on an inner input (Ant Design), and may point at a zero-size
  // accessibility list inside the popup — then the visible popup around it is the list.
  function controlledPopup(...nodes) {
    const linked = [];
    for (const n of nodes) {
      if (!n || !n.getAttribute) continue;
      linked.push(n, ...n.querySelectorAll('[aria-controls], [aria-owns]'));
    }
    for (const n of linked) {
      for (const attr of ['aria-controls', 'aria-owns']) {
        for (const id of (n.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
          let p = document.getElementById(id);
          // Mantine 6 points its box at its own input; its list is "<that id>-items".
          if (p && nodes.some((x) => x && x.contains && x.contains(p)) && p.tagName === 'INPUT') {
            const items = document.getElementById(id + '-items');
            p = items && items.matches('[role="listbox"]') ? items : null;
          }
          // (A list the dropdown draws inside its own box — Tom Select, Headless UI, Ant with its
          // list next to the field — is its list too; any other element inside it is not.)
          const inside = p && nodes.some((x) => x && x.contains && x.contains(p));
          if (!p || (inside && (nodes.includes(p) || !p.matches('[role="listbox"], [role="menu"], [role="tree"], [role="grid"]')))) continue;
          if (isVisible(p)) return p;
          const around = p.parentElement && p.parentElement.closest(OPEN_LIST_SEL);
          if (around && isVisible(around) && !nodes.some((x) => x && around.contains(x))) return around;
        }
      }
    }
    return null;
  }

  // The control a list belongs to: the element that points at it (aria-controls / aria-owns), or
  // the input of a Mantine list ("<input id>-items"). Null when nothing says.
  function listOwner(o, cache) {
    // (Every element walked shares the answer — found or not — so a long list's rows are looked
    // up once, not one page-wide query per row on every poll.)
    const walked = [];
    let found = null;
    for (let p = o; p && p !== document.body; p = p.parentElement) {
      if (cache && cache.has(p)) { found = cache.get(p); break; }
      walked.push(p);
      if (!p.id) continue;
      let owner = document.querySelector(`[aria-controls~="${cssEscape(p.id)}"], [aria-owns~="${cssEscape(p.id)}"]`);
      if (!owner && /-items$/.test(p.id)) owner = document.getElementById(p.id.slice(0, -6));
      if (owner && owner !== p) { found = owner; break; }
    }
    if (cache) for (const w of walked) cache.set(w, found);
    return found;
  }
  // Every custom dropdown of the form being filled (set by Pass C): a list inside one of them, or
  // pointed at by one of them, is that field's list — never another dropdown's choices.
  let knownDropdowns = [];

  // While one dropdown is being handled, lists that were already on screen before it
  // was opened (another field's list, a permanently visible listbox) are ignored —
  // otherwise "it opened" could be concluded from someone else's options.
  let activeOptionFilter = null;
  // …and once its own list is known, every option lookup stays inside that list.
  let activeOwnList = null;
  const EMPTY_LIST = 'The list is empty (no options to choose)';
  // Why a dropdown was left: its list opened but held nothing ("No matches").
  const emptyListReason = (said, typed) => `The list is empty${said ? ` — it shows "${tidy(said, 40)}"` : ' (no options to choose)'}` +
    (typed && typed.length ? ` (also after typing ${typed.map((t) => '"' + t + '"').join(', ')})` : '');
  const isEmptyListReason = (r) => typeof r === 'string' && r.startsWith('The list is empty');
  // "No data", "No options", "Loading…" and similar messages inside a list are not choices.
  const NOT_AN_OPTION_RE = /^(no\s+(data|options?|results?|matches|items?)(\s+found)?|nothing\s+found|no\s+match(es)?|loading(\.\.\.|…)?|searching(\.\.\.|…)?|type\s+to\s+search.*)$/i;
  // What a list says when it has nothing to choose: "No matches", "No data", "No
  // supervisors found", "No results found for "a"", "No choices to choose from".
  const EMPTY_TEXT_RE = /^(no\s+(data|options?|results?|matches|items?|records?|entries|choices)(\s+(found|available|to\s+(show|display|choose\s+from)))?|no\s+results?(\s+found)?\s+(match(ed|es|ing)?|for)\b.*|no\s+([a-z]+\s+){0,2}(results?|records?|items?|options?|matches|data|entries|users?|employees?|supervisors?|managers?|people|persons|staff|members?|providers?|patients?|doctors?|physicians?|contacts?|locations?|facilities|departments?)\s+(found|available|yet)|no\s+match(es|ing\s+\w+)?(\s+found)?|nothing\s+(found|to\s+show|here))\s*[.!]?$/i;
  // "No clinics found", "No insurance plans found": an empty list's message — but only
  // when it is the list's lone row and not marked as an option, and never a clinical
  // finding ("No growth found", "No malignancy found" are answers a person picks).
  const EMPTY_GENERIC_RE = /^no\s+(?!(?:known|fault|defect|trouble|problems?|abnormal\w*|evidence|issues?|errors?|findings?|signs?|symptoms?|acute|significant|growth|malignan\w*|interactions?|fractures?|infections?|lesions?|organisms?|cancer\w*|clots?|dvt|rash(?:es)?|concerns?|allerg\w*|bacteria\w*|mass(?:es)?|nodules?|polyps?|stones?|effusions?|bleeding|blood|pain|swelling|edema|tumou?rs?|metasta\w*|pathogens?|parasites?|ova|cells?|crystals?|casts?|changes?|obstruction|narrowing|stenosis|thromb\w*|embol\w*|pneumo\w*|hemorrhage|haemorrhage|ischemi\w*|injur\w*|damage|anomal\w*|disease|pathology|complications?|residual|recurrence)\b)[a-z][\w'-]*(\s+[a-z][\w'-]*){0,2}\s+found\s*[.!]?$/i;
  const CREATE_OPTION_RE = /^\+\s*(create|add)\b|^(create|add)\s+(new\s+)?["“'‘]/i;
  const loneMessageRow = (o) => o.getAttribute('role') !== 'option' && !o.hasAttribute('aria-selected') &&
    !(o.parentElement && Array.from(o.parentElement.children).filter((c) => c !== o && (c.textContent || '').trim()).length);
  function findVisibleOptions() {
    if (activeOwnList && activeOwnList.isConnected && isVisible(activeOwnList)) return collectOptions(true, activeOwnList);
    return collectOptions(true);
  }

  // Every visible option-like element (no "is it a real choice" filtering) — used to
  // notice lists that are on screen at all.
  function findVisibleOptionsRaw() {
    return collectOptions(false);
  }

  // Is this a choice a person could pick? Not a message ("No data", "Loading…"), not an
  // empty-state block, not a button / field inside a custom list ("Add item"), and — while
  // a dropdown is being handled — not part of a list that was already open before it.
  function isRealOption(o) {
    const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
    const cls = typeof o.className === 'string' ? o.className : '';
    if (NOT_AN_OPTION_RE.test(t) || EMPTY_TEXT_RE.test(t) || /empty|notice|no-results|noOptions|results__message|not-?found|no-?data|no-?match/i.test(cls)) return false;
    if (EMPTY_GENERIC_RE.test(t) && loneMessageRow(o)) return false;
    if (o.querySelector('[class*="empty" i]') || o.closest('[class*="item-empty" i]')) return false;
    // (A checkbox / radio inside the row is fine: multi-select lists draw one per option.)
    if (o.tagName === 'BUTTON' || o.querySelector('button, textarea, select, input:not([type="checkbox"]):not([type="radio"])')) return false;
    if (/^(select|deselect|unselect|clear)\s+all$/i.test(t)) return false;
    // "+ Create Dr. Smith", 'Create "abc"', 'Add "abc"': a list that adds what was typed as a
    // new entry (a new provider record…) — an action, never one of its choices.
    if (CREATE_OPTION_RE.test(t)) return false;
    // Zero-size copies for screen readers (Ant Design keeps one beside the real list).
    const r = o.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return !activeOptionFilter || activeOptionFilter(o);
  }

  // scope: look only inside this list (a dropdown's own popup), ignoring any other open list.
  // A dropdown's clear / remove "×" (or what is inside one): clicking it empties the field.
  function isClearControl(n) {
    const b = n && n.closest && (n.closest('button, [role="button"]') || n);
    if (!b || !b.getAttribute) return false;
    // (Whole words only: a "clearfix" wrapper is not a clear button.)
    return /(^|[\s_-])(clear|remove|reset|delete|close)([\s_-]|$)|CloseButton|clear-?indicator|__clear\b/i.test([b.getAttribute('aria-label'), b.getAttribute('title'), typeof b.className === 'string' ? b.className : ''].join(' ')) &&
      !b.matches('[aria-haspopup="listbox"], [role="combobox"]');
  }
  // Option-like elements without the ones that hold two or more of the others (the list's own
  // wrapper, a group): those are containers, and their text runs all the options together.
  function withoutListWrappers(items) {
    if (items.length < 3) return items;
    const found = new Set(items);
    const held = new Map();
    for (const o of items) for (let p = o.parentElement; p; p = p.parentElement) if (found.has(p)) held.set(p, (held.get(p) || 0) + 1);
    return held.size ? items.filter((o) => (held.get(o) || 0) < 2) : items;
  }
  // The rows of a list's own wrapper ("mantine-Select-itemsWrapper", "…-options-list") that
  // a selector matched as if it were one option: its own class names it a wrapper / list and
  // it holds two or more rows with text. Null for anything else (a real option).
  function listWrapperRows(o) {
    if (!o.children || o.children.length < 2 || o.matches('[role="option"], [role="treeitem"], li')) return null;
    const tokens = (typeof o.className === 'string' ? o.className : '').split(/\s+/);
    if (!tokens.some((c) => /(wrapper|items|list|container|viewport|scrollarea)$/i.test(c))) return null;
    const rows = Array.from(o.children).filter((c) => (c.textContent || '').trim() && !c.matches('[role="group"], [role="presentation"], [aria-hidden="true"]') &&
      !/divider|separator|group-?label|groupheading/i.test(classOf(c)));
    return rows.length >= 2 ? rows : null;
  }
  function collectOptions(realOnly, scope) {
    const popupSelectors = [
      '[role="listbox"]',
      '[role="tree"]',
      '.MuiPopover-paper',
      '.MuiMenu-paper',
      '.MuiAutocomplete-popper',
      '.MuiPopper-root',
      '.react-select__menu',
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
      '.select2-dropdown',
      '[class*="dropdown-menu" i]',
      '[class*="select-menu" i]',
      '[class*="select-dropdown" i]',
      '[class*="options-list" i]',
      '[class*="options-container" i]',
    ];
    const optionSelectors = [
      '[role="option"]:not([aria-disabled="true"])',
      '.MuiMenuItem-root:not(.Mui-disabled)',
      '.MuiAutocomplete-option:not([aria-disabled="true"])',
      '.react-select__option:not(.react-select__option--is-disabled)',
      '.ant-select-item-option:not(.ant-select-item-option-disabled)',
      '.select2-results__option:not(.select2-results__option--disabled)',
      '[class*="dropdown-item" i]:not([disabled])',
      '[class*="select-option" i]:not([disabled])',
      '[class*="select-item" i]:not([disabled])',
      '[role="treeitem"]:not(:has([role="group"]))',
      'li:not([role="presentation"]):not([disabled])',
      '.MuiListItemButton-root:not(.Mui-disabled)',
      '.MuiFormControlLabel-root:not(.Mui-disabled)',
    ];

    // 1. Scoped: scan inside any visible popup containers
    const popups = scope ? [scope] : [];
    if (!scope) for (const sel of popupSelectors) {
      document.querySelectorAll(sel).forEach((p) => {
        if (isVisible(p)) popups.push(p);
      });
    }

    const seen = new Set();
    let result = [];
    // An option never holds several other options: a list's wrapper that matches the same
    // selector (Mantine's "…Select-itemsWrapper" matches [class*="select-item"]) is not one —
    // its text is the whole list.
    const innermost = () => { result = withoutListWrappers(result); };
    // A matched list wrapper whose rows match nothing (rows drawn without a role or class):
    // its rows are the options.
    const take = (o) => {
      for (const r of listWrapperRows(o) || [o]) {
        if (seen.has(r)) continue;
        if (!isVisible(r)) continue;
        const t = (r.textContent || '').trim();
        if (!t) continue;
        if (realOnly && !isRealOption(r)) continue;
        seen.add(r);
        result.push(r);
      }
    };
    if (popups.length) {
      for (const popup of popups) {
        for (const optSel of optionSelectors) {
          popup.querySelectorAll(optSel).forEach(take);
          innermost();
          if (result.length) break;
        }
        // A listbox whose rows carry no option role (plain <div> rows): its rows are the options
        // — inside the list's own wrapper / scroll box, when the rows sit in one.
        if (!result.length && popup.matches && popup.matches('[role="listbox"]')) {
          let rows = Array.from(popup.children);
          while (rows.length === 1 && rows[0].children.length > 1 && !rows[0].matches('[role="option"], li') &&
            /wrap|scroll|viewport|inner|items|list|container|content/i.test(classOf(rows[0]))) rows = Array.from(rows[0].children);
          for (const o of rows) {
            if (!isVisible(o) || !(o.textContent || '').trim() || o.matches('[role="group"], [role="presentation"], [aria-hidden="true"]')) continue;
            if (realOnly && !isRealOption(o)) continue;
            seen.add(o);
            result.push(o);
          }
        }
        if (result.length) break;
      }
      if (result.length || scope) return result;
    }

    // 2. Fallback: scan the whole document (the popup might not match any known selector)
    for (const optSel of optionSelectors.slice(0, 9)) {
      document.querySelectorAll(optSel).forEach(take);
      innermost();
      if (result.length) return result;
    }
    return result;
  }

  // Resolve the actual click target — heuristic detection sometimes returns a
  // descendant (e.g., the placeholder span) instead of the interactive wrapper.
  function resolveTrigger(el) {
    // If el is interactive itself, use it.
    const isInteractive = (n) => {
      if (!n || !n.getBoundingClientRect) return false;
      if (n.tagName === 'BUTTON') return true;
      if (n.tabIndex >= 0) return true;
      const role = n.getAttribute && n.getAttribute('role');
      if (role === 'combobox' || role === 'button' || role === 'listbox') return true;
      const cls = (n.className && typeof n.className === 'string') ? n.className.toLowerCase() : '';
      if (/dropdown|select|combobox|trigger|toggle/.test(cls)) return true;
      return window.getComputedStyle(n).cursor === 'pointer';
    };
    let node = el;
    let depth = 0;
    while (node && depth < 4) {
      if (isInteractive(node)) return node;
      node = node.parentElement;
      depth++;
    }
    return el;
  }

  // Snapshot the currently-visible interactive/list elements so we can detect what
  // newly appears after we open a dropdown — works even when options have no
  // recognizable class or role.
  function snapshotPossibleOptions() {
    const sel = 'li, [role="option"], a, [class*="option" i], [class*="item" i], button';
    const set = new Set();
    document.querySelectorAll(sel).forEach((el) => {
      if (isVisible(el)) set.add(el);
    });
    return set;
  }

  function diffNewOptions(before) {
    const sel = 'li, [role="option"], a, [class*="option" i], [class*="item" i], button';
    const out = [];
    document.querySelectorAll(sel).forEach((el) => {
      if (before.has(el)) return;
      if (!isVisible(el)) return;
      const t = (el.textContent || '').trim();
      if (!t) return;
      // Skip the trigger / placeholder span we just clicked
      if (PLACEHOLDER_RE.test(t) && t.length < 30) return;
      // Nor an empty-state message ("No data") or its wrapper.
      const cls = typeof el.className === 'string' ? el.className : '';
      if (NOT_AN_OPTION_RE.test(t.replace(/\s+/g, ' ')) || EMPTY_TEXT_RE.test(t.replace(/\s+/g, ' ')) || /empty|notice|no-results|noOptions|results__message|not-?found|no-?data|no-?match/i.test(cls) ||
          (EMPTY_GENERIC_RE.test(t.replace(/\s+/g, ' ')) && loneMessageRow(el)) ||
          el.closest('[class*="item-empty" i]')) return;
      if (CREATE_OPTION_RE.test(t.replace(/\s+/g, ' '))) return; // "+ Create …": adds a new entry
      // A list's wrapper whose rows carry no class or role: its rows.
      const rows = listWrapperRows(el);
      if (rows) { for (const r of rows) if (!before.has(r) && isVisible(r) && !CREATE_OPTION_RE.test((r.textContent || '').replace(/\s+/g, ' ').trim())) out.push(r); return; }
      out.push(el);
    });
    return withoutListWrappers(Array.from(new Set(out)));
  }

  // Fire a complete pointer + mouse + click sequence with real coordinates so libraries
  // that gate on event.clientX/Y or pointer-type detection still react.
  function fireOpenStrong(target, { noPress = false } = {}) {
    const why = forbiddenTarget(target);
    if (why) { console.info(`[FillCraft] Did not click ${why} — FillCraft never submits, resets or closes anything.`); return; }
    // Focus moving out of the open dialog makes some dialogs close.
    const mayFocus = !fillScope || containsDeep(fillScope, target);
    const focus = () => { if (mayFocus) { try { target.focus({ preventScroll: true }); } catch {} } };
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const base = (more) => Object.assign({
      bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
      clientX: x, clientY: y, screenX: x, screenY: y,
    }, more || {});
    const pointer = (type) => { if (typeof PointerEvent !== 'undefined') target.dispatchEvent(new PointerEvent(type, base({ pointerType: 'mouse' }))); };
    const mouse = (type) => target.dispatchEvent(new MouseEvent(type, base()));

    // In the order a real mouse sends them. Focus comes with the press — after the page's
    // mousedown handlers, and not at all when the page prevents it (Mantine's dropdowns
    // toggle their list on mousedown and open it on focus: focus first, then the press,
    // opened and closed the list at once; an option it keeps the focus away from closed its
    // list before it was picked).
    pointer('pointerover'); pointer('pointerenter'); mouse('mouseover'); mouse('mouseenter');
    pointer('pointermove'); mouse('mousemove');
    if (noPress) focus();
    else {
      pointer('pointerdown');
      if (mouse('mousedown')) focus();
      pointer('pointerup');
      mouse('mouseup');
    }
    // ONE click. (A dispatched click plus target.click() clicked twice, which closed
    // toggle-style dropdowns right after opening them.)
    mouse('click');
  }

  // Clicks an option (or a list's "click outside" layer) until done() says it worked. In a
  // list drawn outside the open dialog a plain click comes first: a mouse PRESS outside a
  // dialog is what "click outside to close" dialogs react to, and most lists pick on the
  // click alone. Only if that did nothing does the full press + click follow.
  async function clickOption(node, done, ms = 400) {
    if (fillScope && !containsDeep(fillScope, node)) {
      fireOpenStrong(node, { noPress: true });
      if (await waitUntil(done, 300)) return true;
      if (!node.isConnected) return !!done();
    }
    fireOpenStrong(node);
    return waitUntil(done, ms);
  }

  // Wait for option-like elements to appear via MutationObserver — much more reliable
  // than fixed-timeout polling. Resolves as soon as ANY visible option is detected,
  // or after maxMs with whatever was accumulated.
  function waitForOptions(maxMs = 800) {
    return new Promise((resolve) => {
      // Options might already be visible (e.g., already-open dropdown)
      const immediate = findVisibleOptions();
      if (immediate.length) return resolve(immediate);

      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(result);
      };

      const observer = new MutationObserver(() => {
        const opts = findVisibleOptions();
        if (opts.length) finish(opts);
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden', 'aria-expanded', 'hidden'],
      });

      const timer = setTimeout(() => finish(findVisibleOptions()), maxMs);
    });
  }

  // Which click target opened a dropdown of each kind in this fill (see fillCustomDropdownInner).
  // A kind: the field's tag and first class; a target: its tag, first class and where it sits
  // (the field itself, inside it, around it).
  let openTargetByKind = new Map();
  const firstClass = (n) => {
    const c = n && n.className;
    const s = typeof c === 'string' ? c : c && typeof c.baseVal === 'string' ? c.baseVal : '';
    return s.trim().split(/\s+/)[0] || '';
  };
  const dropdownKind = (el) => `${el.tagName}.${firstClass(el)}|${el.getAttribute('role') || ''}`;
  function openTargetKind(c, el, trigger) {
    const where = c === trigger ? 'trigger' : c === el ? 'field' : el.contains(c) ? 'inside' : c.contains(el) ? 'around' : 'near';
    return `${where}|${c.tagName}.${firstClass(c)}|${c.getAttribute('role') || ''}`;
  }

  // Returns true when an option was selected AND the dropdown now shows it, otherwise
  // a short reason string (shown in the popup's log).
  async function fillCustomDropdown(el, hints, mode, opts) {
    touchedFields.add(el);
    lastDropdownDiag = null; // (only this dropdown's own record may reach its row)
    try {
      return await fillCustomDropdownInner(el, hints, mode, opts);
    } finally {
      activeOptionFilter = null;
      activeOwnList = null;
      activeClose = null;
    }
  }

  async function fillCustomDropdownInner(el, hints, mode, opts) {
    typedBoxes = new Set();
    if (opts.skipFilled && isCustomDropdownFilled(el)) return 'Already filled';
    // Never operate on site navigation / menu links — clicking them navigates away.
    if (isInNavRegion(el) || isNavigatingAnchor(el)) return 'Looks like site navigation — not touched';

    // Disabled until something else is chosen (e.g. City until a State is picked).
    if (isDisabledDropdown(el)) return 'Disabled on the page';

    const trigger = resolveTrigger(el);
    if (isInNavRegion(trigger) || isNavigatingAnchor(trigger)) return 'Looks like site navigation — not touched';
    trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
    const beforeText = valueText(el);
    // (What this fill saw and did, for the report when it fails — structure only.)
    const dd = lastDropdownDiag = { field: structureOf(el, 3), mode, listsOpenBefore: 0, openedBy: null, ownList: null, optionsSeen: 0, optionsKept: 0, typed: [], picked: null, tried: [] };

    // Build an ordered list of click candidates. We fire each in turn until options
    // appear. This catches libraries where the actual click handler is on a different
    // element than the one we identified as the trigger.
    const candidates = [];
    const seen = new Set();
    const add = (n) => { if (n && !seen.has(n)) { seen.add(n); candidates.push(n); } };

    add(trigger);
    if (el !== trigger) add(el);
    // A search box with its own list button: the button opens the list.
    if (el.tagName === 'INPUT') { const b = listButtonBeside(el); if (b) add(b); }
    // What a real mouse click would land on: the innermost element at the centre of the
    // field (e.g. MUI's read-only inner box that holds the click handler — events sent to
    // the outer box never reach it).
    const r0 = el.getBoundingClientRect();
    const atPoint = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
    if (atPoint && el.contains(atPoint) && atPoint !== el) add(atPoint.closest('.MuiInputBase-input, .MuiSelect-select') || atPoint);
    el.querySelectorAll?.('.MuiInputBase-input, .MuiSelect-select').forEach((n) => add(n));
    // Inner interactive descendants (combobox / button / input / tabindex)
    el.querySelectorAll?.('[role="combobox"], [role="button"], button, input:not([type=hidden]), [tabindex]').forEach((n) => add(n));
    // Inner SVG / chevron — sometimes the chevron has its own click handler
    el.querySelectorAll?.('svg, [class*="indicator" i], [class*="chevron" i], [class*="arrow" i]').forEach((n) => add(n));
    // Wrapper / parent (1–2 levels) — for libraries where the outer container handles clicks
    if (trigger.parentElement) add(trigger.parentElement);
    if (trigger.parentElement?.parentElement) add(trigger.parentElement.parentElement);
    // Dropdowns of one kind on a page open the same way: the target that opened the last one
    // of this kind goes first (Mantine 6 / Select2 ignore a click on their outer box — trying
    // it first cost 400 ms per dropdown). The others follow in the usual order if it does not.
    const kind = dropdownKind(el);
    const learned = openTargetByKind.get(kind);
    if (learned) {
      const at = candidates.findIndex((c) => openTargetKind(c, el, trigger) === learned);
      if (at > 0) candidates.unshift(candidates.splice(at, 1)[0]);
    }

    // Snapshot BEFORE opening so we can detect newly-rendered options later (used as
    // a fallback when findVisibleOptions misses unusually-classed option elements).
    // Let a previous dropdown's menu finish closing (MUI's exit transition is ~225 ms)
    // so its options are not mistaken for this dropdown's.
    const stillOpen = () => findVisibleOptionsRaw().filter((o) => !(opts.staticOptions && opts.staticOptions.has(o))).length;
    // (At most 480 ms, as before — looked at every 25 ms, so it goes on as soon as it is closed.)
    await waitUntil(() => !stillOpen(), 480);

    const beforeSnapshot = snapshotPossibleOptions();
    // Everything on the page now: a list without recognisable markup is "what appeared".
    const beforeAll = new Set(document.querySelectorAll('body *'));
    const inHouseRows = () => newListRows(beforeAll, el).filter(isRealOption);
    // Another field's list — drawn inside that field (Tom Select, Ant, Headless UI) or pointed at
    // by it — is never this one's, even when it re-opens by itself while this one is handled.
    const others = knownDropdowns.filter((c) => c !== el && c.isConnected && !c.contains(el) && !el.contains(c));
    const ownerCache = new Map();
    const mine = (c) => c === el || el.contains(c) || c.contains(el) || c === trigger || (trigger.contains && trigger.contains(c));
    const foreign = (o) => {
      if (el.contains(o) || !others.length) return false;
      if (others.some((c) => c.contains(o))) return true;
      const owner = listOwner(o, ownerCache);
      return !!owner && !mine(owner) && others.some((c) => c === owner || c.contains(owner) || owner.contains(c));
    };
    activeOptionFilter = (o) => !foreign(o) && (!beforeSnapshot.has(o) || !!controlledPopup(trigger, el)?.contains(o));
    // Lists already on screen belong to something else; closing this one must be checked
    // against the list IT opens — also when that list holds nothing ("No matches").
    const popupsBefore = new Set(shownPopups());
    dd.listsOpenBefore = popupsBefore.size;
    // Which fields those lists belong to (their row in the report), when known.
    const registry = window.__qaFormFillerEls || [];
    dd.openBefore = Array.from(popupsBefore).slice(0, 4).map((p) => {
      const owner = listOwner(p) || p;
      const idx = registry.findIndex((r) => r && r.isConnected && (r === owner || r.contains(owner) || owner.contains(r)));
      return { list: (structureOf(p, 0) || {}).t, ownerIdx: idx >= 0 ? idx : null };
    });
    const expandedBeforeOpen = saysExpanded(el, trigger);
    activeClose = { el, trigger, popupsBefore, ariaLive: false };
    const listIsOpen = () => (!expandedBeforeOpen && saysExpanded(el, trigger)) || !!ownOpenList(el, trigger, popupsBefore);

    let options = [];
    let opened = false;
    let openedAt = performance.now();
    for (const candidate of candidates) {
      // Don't click candidates that are nav links / navigate elsewhere.
      if (isInNavRegion(candidate) || isNavigatingAnchor(candidate)) continue;
      // Nor a clear / remove "×" (it empties the field instead of opening it).
      if (isClearControl(candidate)) continue;
      openedAt = performance.now();
      fireOpenStrong(candidate);
      options = await waitForOptions(400);
      dd.openedBy = structureOf(candidate, 0);
      if (options.length) { openTargetByKind.set(kind, openTargetKind(candidate, el, trigger)); break; }
      // It opened but shows no choices (yet): no more clicks — the next one would close
      // it again (many dropdowns open and close on the same click).
      if (listIsOpen() || freshPanel(beforeAll, el)) { opened = true; break; }
    }
    // When closing, aria-expanded is believed only if it was seen to change as the list
    // opened; the list seen now is the one to watch.
    activeClose.ariaLive = !expandedBeforeOpen && saysExpanded(el, trigger);
    activeClose.list = ownOpenList(el, trigger, popupsBefore);
    // (A list without recognisable markup: the panel that appeared, so it gets closed too.)
    activeClose.panel = activeClose.list ? null : freshPanel(beforeAll, el);
    // Opened but no choices yet: many lists load them only now, with or without a
    // "Loading…" sign — wait for them before calling the list empty. (A searchable one gets
    // that time while its search letters are typed below.)
    const searchable = !!(el.querySelector?.('input:not([type=hidden]):not([readonly])') || (el.tagName === 'INPUT' && !el.readOnly));
    if (!options.length && opened && !searchable) {
      options = isLoadingShown(el) ? await waitForOptionsPatient(4000, el) : [];
      // (Polls the in-house rows too: a list drawn with no known markup, still loading.)
      if (!options.length) await waitUntil(() => (options = findVisibleOptions()).length > 0 || (options = inHouseRows()).length > 0, 1500);
    }

    // What appeared on the page since it was opened — only in the list it opened (or right next
    // to it), never an unrelated new button or link elsewhere (a toast's "Undo", an "Add new").
    const newRowsNearby = () => {
      const pan = ownOpenList(el, trigger, popupsBefore) || freshPanel(beforeAll, el);
      const ACTION_ROW = /^(\+\s*)?(add|create)\b|^(undo|view|edit|delete|remove|close|cancel|dismiss|save|submit|ok|retry|refresh|load\s+more|see\s+all|show\s+more)$/i;
      return diffNewOptions(beforeSnapshot).filter((o) => (pan ? pan.contains(o) : isNearField(o, el)) && !ACTION_ROW.test((o.textContent || '').replace(/\s+/g, ' ').trim()));
    };
    if (!options.length) {
      // Diff fallback in case findVisibleOptions doesn't recognize the option markup
      options = newRowsNearby();
    }
    if (!options.length) options = inHouseRows();
    if (!activeClose.list && !activeClose.panel) activeClose.panel = freshPanel(beforeAll, el);

    // Autocompletes (e.g. "Subjects") list nothing until you type. Type the start of
    // the wanted value — or a common letter — into the dropdown's own search box.
    // Server-backed lookups (pharmacy, provider, ICD…) search as you type: use the start
    // of the wanted value, then common letters, and wait while the page shows it is
    // loading. What was typed is reported if nothing comes back.
    const typedSeeds = [];
    let searchBox = null;
    let emptySaid = ''; // what the list said while letters were typed ("No matches")
    if (!options.length) {
      // (Never into a read-only trigger: a list with its own "Type to Search" box is
      // searched there.)
      const search = el.querySelector?.('input:not([type=hidden]):not([readonly])') || (el.tagName === 'INPUT' && !el.readOnly ? el : null) ||
        popupSearchInput(el, ownOpenList(el, trigger, popupsBefore));
      searchBox = search;
      if (search) {
        search.focus({ preventScroll: true });
        for (const seed of searchSeeds(hints, mode)) {
          if (userStopped()) break;
          typedSeeds.push(seed);
          await typeSlowly(search, seed, 25, { blur: false });
          options = await waitForOptionsPatient(3000, el);
          if (options.length) break;
          const saidNow = emptyListText(ownOpenList(el, trigger, popupsBefore));
          if (saidNow) { emptySaid = saidNow; opened = true; }
          // (A list that loads its choices when first opened may say "No data" for a few
          // seconds: not empty before ~3 s have passed.)
          if (seed.length === 1 && !isLoadingShown(el) && saidNow && performance.now() - openedAt > 3200) break;
        }
      }
      // Choices that arrived while a letter was typed may all be filtered out by it: one
      // last look with the search box empty.
      if (!options.length && search && search.value && !userStopped()) {
        nativeSet(search, '');
        search.dispatchEvent(new Event('input', { bubbles: true }));
        options = await waitForOptions(Math.max(600, 3200 - (performance.now() - openedAt)));
      }
    }

    if (!options.length && !opened && !listIsOpen()) {
      // Keyboard fallback — some headless components (Radix, headlessui) open on
      // Space/ArrowDown. NOTE: we deliberately do NOT send 'Enter' here — inside a
      // <form> an Enter keypress submits the form and closes the modal, which is
      // exactly the unwanted behavior we want to avoid while only filling fields.
      for (const key of ['ArrowDown', ' ']) {
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }));
        trigger.dispatchEvent(new KeyboardEvent('keyup',   { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }));
      }
      options = await waitForOptions(400);
      if (!options.length) options = newRowsNearby();
      if (!options.length) options = inHouseRows();
    }

    dd.typed = typedSeeds.slice();
    dd.expandedNow = saysExpanded(el, trigger);
    if (!options.length) {
      // (What appeared, if anything: a list FillCraft does not recognise is the thing to see.)
      dd.listShown = structureOf(ownOpenList(el, trigger, popupsBefore) || controlledPopup(trigger, el) || freshPanel(beforeAll, el), 3);
      console.warn('[FillCraft] Could not open dropdown — no options appeared.',
        '\n  element:', el,
        '\n  resolved trigger:', trigger,
        '\n  tag:', trigger.tagName, 'class:', trigger.className, 'role:', trigger.getAttribute?.('role'));
      // Previously we called document.body.click() here to dismiss any half-opened
      // popup. That fires the "click-outside" handler that modal libraries use to
      // close themselves, so it was silently closing the whole modal. Since no
      // options actually opened, there is nothing to dismiss — just bail out.
      // Its own list opened but holds nothing ("No matches", "No data"): nothing to
      // choose — not a failure. Read what it says before closing it.
      const ownPop = ownOpenList(el, trigger, popupsBefore) || controlledPopup(trigger, el);
      const said = emptyListText(ownPop) || emptySaid;
      // (aria-expanded counts only when it changed as FillCraft opened it — one stuck at "true"
      // says nothing about this attempt.)
      const wasOpen = opened || !!ownPop || (!expandedBeforeOpen && saysExpanded(el, trigger));
      // Nothing found: take the typed letters out of its search box again.
      if (typedSeeds.length && searchBox && searchBox.isConnected && searchBox.value) await typeSlowly(searchBox, '', 0, { blur: false });
      await closeDropdown(el);
      if (wasOpen) return emptyListReason(said, typedSeeds);
      return typedSeeds.length
        ? `No options appeared (typed ${typedSeeds.map((t) => '"' + t + '"').join(', ')} into its search box)`
        : 'The dropdown did not open (no options appeared)';
    }

    // Safety filter: drop any "option" that is actually site navigation or a link
    // that navigates to another page/route. Without this, a mis-detected navbar/user
    // menu would get an item clicked (e.g. "Logout"), navigating away and closing the
    // form. If everything is filtered out, treat the dropdown as not-openable.
    // Prefer the list this dropdown says it controls (aria-controls / aria-owns), so
    // an unrelated always-visible listbox on the page is never picked from.
    const ownList = controlledPopup(trigger, el);
    dd.optionsSeen = options.length;
    dd.option = structureOf(options[0], 1);
    // (How many separate lists the options came from: more than one = another field's list too.)
    dd.listsWithOptions = new Set(options.map((o) => o.closest('[role="listbox"], [role="menu"], ul, [class*="list" i], [class*="menu" i], [class*="dropdown" i]'))).size;
    dd.ownList = ownList ? structureOf(ownList, 1) : null;
    if (ownList) {
      let own = options.filter((o) => ownList.contains(o));
      // The options seen so far came from somewhere else (e.g. another field's list
      // still animating closed): give this dropdown's own list a moment to draw.
      if (!own.length) {
        await waitUntil(() => (own = collectOptions(true, ownList)).length > 0, 1500);
      }
      if (own.length) { options = own; activeOwnList = ownList; }
    }
    // A list that was already open before this dropdown was opened belongs to another
    // field: never pick from it.
    options = options.filter((o) => ((ownList && ownList.contains(o)) || !beforeSnapshot.has(o)) && !foreign(o));
    dd.optionsKept = options.length;
    if (!options.length) {
      await closeDropdown(el);
      return 'The dropdown did not open (only another field\'s list was showing)';
    }

    // Group headings ("Category 1") and disabled entries are not choices.
    options = options.filter((o) => !o.matches('[class*="ListSubheader"], [class*="optgroup" i], [class*="group-label" i], [class*="GroupHeading"], [role="presentation"], [aria-disabled="true"], .mat-mdc-optgroup-label'));
    // Never an action-menu item, a site-nav item or a link that leaves the page. (A menu
    // row with its own checkbox is a choice of a multi-select list, e.g. MUI MenuItem +
    // Checkbox: that one is kept.)
    const checkboxRow = (o) => !!o.querySelector('input[type="checkbox"], input[type="radio"], [role="checkbox"]') || o.hasAttribute('aria-checked');
    options = options.filter((o) => !isInNavRegion(o) && !isNavigatingAnchor(o) &&
      ((o.getAttribute('role') !== 'menuitem' && !o.closest('[role="menu"], [role="menubar"]')) || checkboxRow(o)));
    if (!options.length) {
      console.warn('[FillCraft] Dropdown options looked like navigation links — skipping to avoid navigating away.');
      return 'Its options were links — not clicked, to avoid leaving the page';
    }

    // Pick per the dropdown strategy (match the data — whole-word, so "Male" never
    // picks "Female" — / first / last / random), always from the live options.
    let notSelected = options.filter((o) => !isOptionSelected(o));
    let pool = notSelected.length ? notSelected : options;
    // The wanted value is not among the rows drawn so far (long lists only draw what is
    // visible): look for it by searching, then by scrolling the list.
    // (Valid data only: with Invalid / Edge data the "wanted" value is a test string no list
    // holds — a dropdown cannot hold invalid text, so one of its own options is chosen.)
    if (mode === 'valid' && opts.dropdownStrategy === 'match' && hints && hints.length && !findByHints(pool, hints, (o) => [o.textContent || ''])) {
      const found = await findOptionBeyondView(el, hints, pool);
      // Stop was pressed while the list was searched: close it and pick nothing.
      if (!found && userStopped()) { await closeDropdown(el); return USER_STOP_REASON; }
      if (found) pool = [found];
      else if (STRICT_MATCH_KEYS.includes(opts.fieldKey) && (() => {
        // Long / scrolling / searchable lists may hold the wanted value out of sight: stay
        // strict. A short list shown in full does not have it: any of its values will do.
        // Judge the list as it is on screen now (a search may have redrawn it).
        const live = findVisibleOptions().filter((o) => o.isConnected);
        if (!live.length || live.length > 15) return true;
        const box = scrollableAncestor(live[0]);
        return !!(box && box.scrollHeight > box.clientHeight + 4);
      })()) {
        // A random country / state / time zone would contradict the rest of the address:
        // leave it and say what was missing instead.
        await closeDropdown(el);
        return `Couldn't find "${tidy(String(hints[0]), 30)}" in the list`;
      } else {
        options = findVisibleOptions().filter((o) => !isNavigatingAnchor(o) && o.getAttribute('role') !== 'menuitem');
        notSelected = options.filter((o) => !isOptionSelected(o));
        pool = notSelected.length ? notSelected : options.length ? options : pool;
      }
    }
    // "All" / "Select all" ticks every choice at once: never the value FillCraft picks
    // while real choices are there.
    const SELECT_ALL_RE = /^\s*(\(?all\)?|select\s+all|all\s+(of\s+the\s+above|[a-z]+s))\s*$/i;
    const specific = pool.filter((o) => !SELECT_ALL_RE.test((o.textContent || '').trim()));
    if (specific.length) pool = specific;
    const target = chooseOption(pool, hints, (o) => [o.textContent || ''], opts.dropdownStrategy);
    if (!target) {
      await closeDropdown(el);
      return 'No option could be chosen';
    }
    const wanted = (target.textContent || '').trim();
    dd.picked = { row: structureOf(target, 1), inOwnList: !!(ownList && ownList.contains(target)), textLength: wanted.length };
    // The rows on screen now — also of a list without recognisable markup — and whether the
    // choice took: the dropdown shows it, or its row (found again by its text, when the list
    // redrew itself) is marked chosen.
    const liveRows = () => { const a = findVisibleOptions(); return a.length ? a : inHouseRows(); };
    const rowOf = (text) => liveRows().find((o) => (o.textContent || '').trim() === text) || null;
    const pickedNow = () => {
      if (selectionShows(el, wanted, beforeText, target)) return true;
      if (target.isConnected) return false;
      const again = rowOf(wanted);
      return !!again && isOptionSelected(again);
    };
    // A click where a pointer would land (the option's text; in a checkbox row inside its
    // <label> that ticks the box) — then, in a checkbox row where only the checkbox itself
    // reacts, the checkbox: only while it is still unticked, so it is never ticked twice
    // (= unticked) in lists where the whole row reacts.
    const pickRow = async (row, done) => {
      const text = (row.textContent || '').trim();
      if (!row.isConnected) row = rowOf(text) || row;
      row.scrollIntoView({ block: 'center', behavior: 'instant' });
      const tr = row.getBoundingClientRect();
      const hitEl = document.elementFromPoint(tr.left + Math.min(tr.width / 2, 60), tr.top + tr.height / 2);
      await clickOption(hitEl && row.contains(hitEl) ? hitEl : row.querySelector('label') || row, done);
      // A list that ignores the first release after it opened (Radix: a row drawn right over the
      // field it opened from) takes a second click — only on a plain row that is still shown and
      // unchosen, in a single-choice list (a second click never unticks anything).
      if (!done() && row.isConnected && isShown(row) && !rowCheckbox(row) && !isOptionSelected(row) && !row.closest('[aria-multiselectable="true"]')) {
        await clickOption(hitEl && row.contains(hitEl) ? hitEl : row, done);
      }
      // (The row is looked up again before each try: a list that reloads draws new rows.)
      const freshBox = () => { if (!row.isConnected) row = rowOf(text) || row; return rowCheckbox(row); };
      let box = freshBox();
      if (box && !isBoxTicked(box) && !done()) {
        // Where a pointer lands on a checkbox: the (see-through) input itself in MUI and
        // most libraries — its wrapper does not react to a click of its own.
        const hit = box.tagName === 'INPUT' ? box : (box.closest('.ant-checkbox-wrapper, .el-checkbox, .p-checkbox') || box);
        await clickOption(hit, () => isBoxTicked(freshBox()) || done());
        box = freshBox();
        if (box && box.tagName === 'INPUT' && box.isConnected && !isBoxTicked(box) && !done()) {
          box.click();
          await waitUntil(() => isBoxTicked(freshBox()) || done(), 400);
        }
      }
    };

    // (Rows on screen before the pick: never a "next column" of a multi-level list below.)
    const CASCADE_ROW_SEL = '[role="option"], [role="treeitem"], .ant-cascader-menu-item, .el-cascader-node';
    const rowsBeforePick = new Set(document.querySelectorAll(CASCADE_ROW_SEL));
    // Strategy 1: click the option — the row on screen now (a list that reloaded meanwhile
    // drew new rows: the one with the same text).
    await pickRow(target.isConnected ? target : rowOf(wanted) || target, pickedNow);
    dd.tried.push('click' + (pickedNow() ? ' → shows it' : ' → not shown'));

    // Multi-level lists (cascaders: State → City → Clinic): a pick can open the next
    // column instead of closing the list. Keep picking in the newest column.
    for (let level = 0; level < 4 && !pickedNow(); level++) {
      await sleep(120);
      const known = new Set(options.map((o) => (o.textContent || '').trim()));
      // (Only rows the pick brought: a new column — not rows of the same list scrolled into view.)
      const next = Array.from(document.querySelectorAll(CASCADE_ROW_SEL))
        .filter((o) => !rowsBeforePick.has(o) && isShown(o) && isRealOption(o) && !known.has((o.textContent || '').trim()));
      if (!next.length) break;
      const pick = chooseOption(next, hints, (o) => [o.textContent || ''], opts.dropdownStrategy);
      if (!pick) break;
      options = options.concat(next);
      await clickOption(pick, pickedNow);
    }

    // Strategy 2: searchable dropdowns (React-Select, MUI Autocomplete, Select2…) —
    // type the option text into the dropdown's own input and pick the filtered match.
    // (The list is reopened only when it is really closed: a click on the box of an open
    // list closes it.)
    if (!pickedNow()) {
      const search = el.querySelector('input:not([type=hidden]):not([readonly])') ||
        (el.tagName === 'INPUT' && !el.readOnly ? el : null) || popupSearchInput(el);
      if (search && wanted) {
        if (!liveRows().length) { fireOpenStrong(trigger); await waitForOptions(400); }
        await typeSlowly(search, wanted.slice(0, 30), 15, { blur: false });
        let filtered = await waitForOptions(600);
        // (A list that reloads from the server as you type: its new rows.)
        if (!findByHints(filtered, [wanted], (o) => [o.textContent || ''])) {
          await waitUntil(() => !!findByHints((filtered = liveRows()), [wanted], (o) => [o.textContent || '']), 2000);
        }
        const hit = findByHints(filtered, [wanted], (o) => [o.textContent || '']);
        if (hit && !isOptionSelected(hit)) await pickRow(hit, () => pickedNow() || isOptionSelected(hit));
        dd.tried.push('search box' + (hit ? '' : ' (no match)') + (pickedNow() ? ' → shows it' : ' → not shown'));
      }
    }

    // Strategy 3: keyboard — with the list open, arrow down to the option and press
    // Enter. Enter goes to the open listbox (not the form), so it selects, not submits.
    if (!pickedNow()) {
      if (!liveRows().length) { fireOpenStrong(trigger); await waitForOptions(400); }
      const live = findVisibleOptions();
      const idx = live.findIndex((o) => (o.textContent || '').trim() === wanted);
      const focusTarget = el.querySelector('input:not([type=hidden])') || trigger;
      if (idx >= 0 && live.length) {
        const press = (key) => {
          focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
          focusTarget.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }));
        };
        for (let i = 0; i <= idx; i++) press('ArrowDown');
        // Only press Enter while the listbox is still open (synthetic key events never trigger
        // the browser's own form submission) — and not when the list says another row is the
        // highlighted one (it started on a row, or counts rows FillCraft left out): Enter would
        // choose that row.
        const activeId = focusTarget.getAttribute('aria-activedescendant');
        const active = activeId && document.getElementById(activeId);
        if (findVisibleOptions().length && !(active && (active.textContent || '').trim() !== wanted)) press('Enter');
        await waitUntil(pickedNow, 400);
      }
      dd.tried.push('arrow keys + Enter' + (idx >= 0 ? '' : ' (row not found)') + (pickedNow() ? ' → shows it' : ' → not shown'));
    }

    if (!pickedNow()) {
      dd.fieldAfter = structureOf(el, 3);
      await closeDropdown(el);
      return `Picked "${tidy(wanted, 30)}" but the dropdown does not show it`;
    }
    await closeDropdown(el); // leave no menu open (multi-selects and Angular keep it open)
    // Its search box shows what FillCraft typed there, chosen or not (Mantine empties it again
    // once it is left): after typing, the choice must still show with the list closed.
    const typedHere = Array.from(typedBoxes).some((b) => b.isConnected && (b === el || el.contains(b)));
    if (typedHere && !(await waitUntil(() => selectionShows(el, wanted, beforeText, null), 400))) {
      dd.tried.push('typed into its search box: the choice did not stay once the list closed');
      dd.fieldAfter = structureOf(el, 3);
      return `Picked "${tidy(wanted, 30)}" but the dropdown does not show it`;
    }
    if (opts.highlight) flashHighlight(el, mode);
    return true;
  }

  // Resolves as soon as fn() is true, or after maxMs (returns fn()'s final value).
  async function waitUntil(fn, maxMs) {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      if (fn()) return true;
      await sleep(25);
    }
    return !!fn();
  }

  // A search box result can take a while when it comes from a server: keep waiting
  // (up to maxMs) while the page shows a loading indicator.
  const LOADING_SEL = '[class*="loading" i], [aria-busy="true"], [role="progressbar"], mat-spinner, mat-progress-spinner, [class*="spinner" i]';
  const OPEN_LIST_SEL = '[role="listbox"], .MuiAutocomplete-popper, .react-select__menu, [class*="-menu"], .ant-select-dropdown, .select2-dropdown, .choices__list--dropdown, .mat-mdc-select-panel, .mat-mdc-autocomplete-panel, .cdk-overlay-pane';
  // Popups of any library on screen — to notice the one a dropdown opens, also when it
  // holds no choices at all. (Vuetify draws a dialog's box, and a menu holding a form, with
  // the same class as a list's popup: those are never lists. Nor is a tooltip.)
  const POPUP_SEL = [OPEN_LIST_SEL, '.MuiPopover-root', '.MuiPopper-root', '[role="menu"]', '.select2-container--open .select2-dropdown',
    '.ts-dropdown', '.el-select-dropdown', '.el-popper', '.v-overlay__content:not(.v-dialog > .v-overlay__content):not(.v-bottom-sheet > .v-overlay__content)',
    '.dropdown-menu.show', '[class*="dropdown-menu" i]', '[class*="select-dropdown" i]', '[class*="options-list" i]'].join(', ');
  const POPUP_ROOT_SEL = '.MuiPopover-root, .MuiPopper-root, .MuiAutocomplete-popper, .cdk-overlay-pane, .ant-select-dropdown, .select2-container, .select2-dropdown, .choices__list--dropdown, .ts-dropdown, .el-popper, .v-overlay__content, [role="presentation"]';
  const DIALOG_BOX_SEL = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog, mat-dialog-container, .mat-mdc-dialog-container, .MuiDialog-paper, .v-dialog';
  const TOOLTIP_SEL = '[role="tooltip"], [class*="tooltip" i], .ant-popover, .popover, .tippy-box';
  function shownPopups() {
    return Array.from(document.querySelectorAll(POPUP_SEL)).filter((p) => isShown(p) && !isInNavRegion(p) &&
      // Not a field that only carries a popup-ish class, not a dialog or what holds one,
      // not a form drawn in a menu, not a tooltip, not the open dialog FillCraft works in.
      !p.matches('input, select, textarea, button') && !p.matches(DIALOG_BOX_SEL) && !p.querySelector(DIALOG_BOX_SEL) &&
      !(p.matches('.v-overlay__content') && p.querySelector('.v-field, input:not([type="hidden"]), textarea')) &&
      !p.matches(TOOLTIP_SEL) && !p.querySelector(':scope > [role="tooltip"], :scope > [class*="tooltip" i]') &&
      !(fillScope && (p === fillScope || p.contains(fillScope))));
  }
  // Does the dropdown (or its input / button) say its list is open?
  function saysExpanded(el, trigger) {
    const nodes = [trigger, el, ...(el && el.querySelectorAll ? el.querySelectorAll('[aria-expanded="true"]') : [])];
    return nodes.some((n) => n && n.getAttribute && n.getAttribute('aria-expanded') === 'true');
  }
  // A popup drawn right next to a field (below / above it, overlapping sideways).
  function isNearField(p, el) {
    const r = el.getBoundingClientRect();
    const q = p.getBoundingClientRect();
    const gap = Math.max(q.top - r.bottom, r.top - q.bottom, 0);
    return q.left < r.right + 40 && q.right > r.left - 40 && gap <= 80;
  }
  // The list this dropdown has open right now — even an empty one — or null: the list it
  // points to (aria-controls / aria-owns), else a popup that appeared since it was opened
  // right next to it (not a toast or a list somewhere else on the page).
  function ownOpenList(el, trigger, popupsBefore) {
    const ctl = controlledPopup(trigger, el);
    if (ctl) return ctl;
    const fresh = shownPopups().filter((p) => p !== el && !(popupsBefore && popupsBefore.has(p)));
    const inner = fresh.filter((p) => !fresh.some((q) => q !== p && p.contains(q)) && isNearField(p, el));
    return inner[inner.length - 1] || null;
  }
  // The words an empty list shows ("No matches", "No data"), or ''.
  function emptyListText(list) {
    if (!list || !list.querySelectorAll) return '';
    const root = (list.closest && list.closest(POPUP_ROOT_SEL)) || list;
    let best = '';
    for (const n of [root, ...root.querySelectorAll('*')]) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 60 || !isShown(n)) continue;
      const cls = typeof n.className === 'string' ? n.className : '';
      if (EMPTY_TEXT_RE.test(t) || EMPTY_GENERIC_RE.test(t) || (NOT_AN_OPTION_RE.test(t) && !/^(loading|searching|type\s+to)/i.test(t)) ||
          (/no-?options|no-?results|no-?data|no-?match|empty/i.test(cls) && !/loading/i.test(t))) {
        if (!best || t.length < best.length) best = t;
      }
    }
    return best;
  }
  // The dropdown's own open/close control: a button that says it is expanded, else its
  // arrow, else the trigger — never a text box (clicking one does not close anything) and
  // never its "clear" button.
  function dropdownToggle(el, trigger) {
    const isClear = (n) => /clear|remove|reset/i.test([n.getAttribute('aria-label'), n.getAttribute('title'), typeof n.className === 'string' ? n.className : ''].join(' '));
    const pairButton = el.tagName === 'INPUT' ? listButtonBeside(el) : Array.from(el.querySelectorAll('input[role="combobox"]')).map(listButtonBeside).find(Boolean);
    const expandedButton = [trigger, el, ...el.querySelectorAll('[aria-expanded="true"]'), pairButton].find((n) =>
      n && n.matches && n.matches('button, [role="button"], [role="combobox"]:not(input)') && n.getAttribute('aria-expanded') === 'true' && !isClear(n));
    if (expandedButton) return expandedButton;
    const arrow = Array.from(el.querySelectorAll('.MuiAutocomplete-popupIndicator, [class*="dropdown-indicator" i], [class*="DropdownIndicator"], .select2-selection__arrow, .ant-select-arrow, .el-select__caret, .v-field__append-inner, [class*="indicatorContainer"], [class*="arrow" i], [class*="chevron" i], [class*="caret" i]'))
      .find((n) => isShown(n) && !isClear(n) && !(n.closest('button') && isClear(n.closest('button'))));
    if (arrow) return arrow.closest('button') || arrow;
    if (pairButton) return pairButton;
    return trigger && trigger.tagName !== 'INPUT' && trigger.getAttribute && trigger.getAttribute('aria-expanded') === 'true' ? trigger : null;
  }
  // Where a person clicks to close a list: the empty background of the form around the
  // field — the nearest box that holds this field and another of the form's fields (a
  // form row or section; never the dropdown itself or its open panel, never inside a
  // clickable row / item), inside the open dialog. When the field sits alone in a pop-up
  // (a popover form), that pop-up's own box. Never the page body: a click there closes
  // any pop-up the form lives in. Headings are avoided: many are clickable without showing
  // it (collapse a section, sort a table).
  function neutralSpotNear(el, list) {
    const clickableAround = 'tr, [role="row"], [role="gridcell"], [role="listbox"], [role="menu"], [role="option"], [role="button"], [role="tab"], [role="link"], a[href], button, label, summary, [onclick], [aria-expanded], [data-bs-toggle], [data-toggle]';
    let listRoot = list && ((list.closest && list.closest(POPUP_ROOT_SEL)) || list);
    // A pop-up that holds the field itself is the FORM's layer (a form in an MUI Popper whose
    // list is drawn inline), not the list's: its fields are still the form's fields.
    if (listRoot && listRoot !== list && containsDeep(listRoot, el)) listRoot = list;
    const formFields = (box) => Array.from(box.querySelectorAll(FIELDISH_SEL)).filter((f) => !el.contains(f) && !f.contains(el) &&
      !(listRoot && listRoot.contains(f)) && !f.closest('[role="listbox"], [role="menu"], [role="option"]') && isPresent(f));
    const elWidth = el.getBoundingClientRect().width;
    let layer = null; // the pop-up layer the field sits in (a popover form), if any
    for (let box = el.parentElement, i = 0; box && box !== document.body && i < 15; box = box.parentElement, i++) {
      if (fillScope && !containsDeep(fillScope, box)) break;
      const pos = getComputedStyle(box).position;
      const isLayer = (pos === 'fixed' || pos === 'absolute') && coveringLayer(box) !== box && box.getBoundingClientRect().width > elWidth + 20;
      const usable = !box.closest(clickableAround) && coveringLayer(box) !== box;
      if (usable && formFields(box).length) return box;
      if (isLayer) { layer = usable ? box : null; break; } // never climb out of a pop-up
    }
    // Inside the pop-up's own box, not on its positioned wrapper: libraries watch for clicks
    // outside the box (MUI's ClickAwayListener wraps the Paper, not the Popper).
    if (layer) return Array.from(layer.children).find((c) => containsDeep(c, el) && !c.closest(clickableAround)) || layer;
    if (fillScope) {
      let box = fillScope;
      while (box && coveringLayer(box) === box) box = Array.from(box.children).find((c) => containsDeep(c, el)) || null;
      return box && !box.closest(clickableAround) ? box : null;
    }
    return null;
  }
  // The transparent "click outside" layer that belongs to THIS open list (MUI menus,
  // Angular CDK panels) — never the layer of a dialog or popover that holds the form.
  function ownBackdrop(list, el) {
    if (!list) return null;
    const layers = Array.from(document.querySelectorAll(TRANSPARENT_BACKDROP_SEL)).filter((b) => {
      // (Transparent layers are opacity 0 by design: "visible" = present and covering an area.)
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
    }).reverse();
    for (const b of layers) {
      // Angular CDK: the layer sits right before the panel's box. MUI: layer and list share
      // their own root (.MuiPopover-root).
      const box = b.nextElementSibling && b.nextElementSibling.contains(list) ? b.nextElementSibling
        : b.parentElement && b.parentElement !== document.body && b.parentElement.contains(list) ? b.parentElement : null;
      if (!box || box.contains(el) || (fillScope && box.contains(fillScope))) continue;
      if (box.matches('.cdk-overlay-container')) continue; // shared by every overlay, dialogs included
      return b;
    }
    return null;
  }
  // Waits while a list is still fading / sliding shut after a pick, so it is not taken for
  // open and clicked again. Watches what the eye sees — the list's opacity (with its
  // wrappers') and its size / position — so script-driven fades count too; a spinner that
  // animates forever does not keep it waiting.
  async function settleAnimations(list, maxMs = 1200) {
    const root = list && ((list.closest && list.closest(POPUP_ROOT_SEL)) || list);
    if (!root) return;
    const nodes = [];
    for (let n = root, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) nodes.push(n);
    const finite = (a) => { try { const t = a.effect && a.effect.getComputedTiming(); return a.playState === 'running' && !!t && t.endTime !== Infinity; } catch (_) { return false; } };
    const animating = () => nodes.some((n) => n.isConnected && typeof n.getAnimations === 'function' && n.getAnimations({ subtree: n === root }).some(finite));
    const look = () => {
      let o = 1;
      for (const n of nodes) { if (!n.isConnected) return 'gone'; o *= parseFloat(getComputedStyle(n).opacity) || 0; }
      const r = root.getBoundingClientRect();
      return `${o.toFixed(2)}|${Math.round(r.height)}|${Math.round(r.top)}`;
    };
    const t0 = performance.now();
    let last = look();
    while (performance.now() - t0 < maxMs) {
      await sleep(80);
      const now = look();
      if (now === 'gone' || (!animating() && now === last)) return;
      last = now;
    }
  }

  function isLoadingShown(el) {
    // (Also any popup right next to the field: Element Plus writes "Loading" into the same
    // box that later says "No matches".)
    const scopes = el ? [el, controlledPopup(el), ...shownPopups().filter((p) => isNearField(p, el))].filter(Boolean)
      : Array.from(document.querySelectorAll(OPEN_LIST_SEL)).filter(isShown);
    const drawn = (n) => { if (!isShown(n)) return false; const r = n.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; };
    return scopes.some((sc) => (sc.matches && sc.matches(LOADING_SEL) && drawn(sc)) ||
      Array.from(sc.querySelectorAll(LOADING_SEL)).some(drawn) ||
      /^\s*loading\b/i.test(sc === el ? '' : (sc.textContent || '')));
  }
  async function waitForOptionsPatient(maxMs = 3000, el = null) {
    const t0 = performance.now();
    let found = await waitForOptions(700);
    while (!found.length && performance.now() - t0 < maxMs && isLoadingShown(el)) found = await waitForOptions(400);
    return found;
  }

  // What to type into a search-as-you-type dropdown: the start of the wanted value
  // (skipping titles like "Dr."), then a few common letters.
  function searchSeeds(hints, mode) {
    const seeds = [];
    const STOP = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'the', 'of', 'and']);
    // (Invalid / Edge data: the value is a test string — "<script>…", "' OR '1'='1" — never typed
    // into an app's search; a dropdown gets one of its own options, found with common letters.)
    for (const h of (mode && mode !== 'valid') ? [] : (Array.isArray(hints) ? hints : [hints])) {
      if (h == null) continue;
      const word = String(h).split(/[\s,/()-]+/).find((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
      // (The same start twice — State's "TX" as code and as value — counts once, so its name's
      // start, "Texa", is searched too.)
      const seed = word && word.slice(0, word.length > 4 ? 4 : word.length);
      if (seed && !seeds.includes(seed)) seeds.push(seed);
      if (seeds.length >= 2) break;
    }
    for (const g of ['a', 'e', 'm']) seeds.push(g);
    return [...new Set(seeds)].slice(0, 4);
  }

  // Find the wanted option outside the rows currently drawn: type it into the
  // dropdown's own search box (the list filters to it), or scroll the list.
  // Dropdowns whose value must agree with the rest of the data: never a random pick.
  const STRICT_MATCH_KEYS = ['country', 'countryCode', 'state', 'stateCode', 'timeZone'];

  // A search box that belongs to the open list rather than to the field ("Type to
  // search" at the top of a popup): the focused input inside the popup, or the first
  // visible text input around the dropdown's own list.
  // The search box inside the dropdown's open list ("Type to Search"). list: the list just
  // opened, when known.
  function popupSearchInput(el, list) {
    const POPUP_ROOT = '.MuiPopover-root, .MuiPopper-root, .MuiAutocomplete-popper, .cdk-overlay-pane, .ant-select-dropdown, .select2-dropdown, .choices__list--dropdown, [role="presentation"], [role="dialog"], [role="listbox"]';
    const a = document.activeElement;
    // (The focused box counts only inside a pop-up of its own — a list's "Type to search" box —
    // never a field of the dialog the form is in: another field still holding the focus (a
    // phone box) would be typed into and emptied.)
    const aRoot = a && a.tagName === 'INPUT' && a.closest(POPUP_ROOT);
    if (aRoot && !el.contains(a) && !a.readOnly && isVisible(a) && !aRoot.contains(el)) return a;
    const from = list || activeOwnList;
    const root = from && (from.closest(POPUP_ROOT) || from.parentElement);
    if (!root || root.contains(el)) return null;
    return Array.from(root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([readonly])')).find(isVisible) || null;
  }

  async function findOptionBeyondView(el, hints, current) {
    // (Each value once: State's hints are "TX" twice, then "Texas" — typing "TX" twice never
    // finds Texas in a list that searches names.)
    const wanted = [...new Map((Array.isArray(hints) ? hints : [hints]).filter((h) => h != null && String(h).trim().length >= 2)
      .map((h) => [String(h).trim().toLowerCase(), String(h)])).values()];
    if (!wanted.length) return null;
    const textsOf = (o) => [o.textContent || ''];
    const search = el.querySelector?.('input:not([type=hidden]):not([readonly])') || (el.tagName === 'INPUT' && !el.readOnly ? el : null) || popupSearchInput(el);
    if (search) {
      for (const h of wanted.slice(0, 2)) {
        if (userStopped()) break;
        await typeSlowly(search, h.slice(0, 24), 12, { blur: false });
        // (A list that filters a moment later — a server search, a debounce — still shows its old
        // rows right after typing: wait for the wanted one, longer while it says "Loading…".)
        let hit = findByHints(await waitForOptionsPatient(2000, el), wanted, textsOf);
        if (!hit) await waitUntil(() => !!(hit = findByHints(findVisibleOptions(), wanted, textsOf)), isLoadingShown(el) ? 4000 : 2000);
        if (hit) return hit;
      }
      // Not found: clear the search so the full list shows again.
      await typeSlowly(search, '', 0, { blur: false });
      await waitForOptions(400);
      return null;
    }
    const box = scrollableAncestor(current[0]);
    if (!box) return null;
    // Scroll to the end of the list (long lists: time zones, countries), within a time budget.
    const t0 = performance.now();
    while (performance.now() - t0 < 8000 && !userStopped()) {
      const before = box.scrollTop;
      box.scrollTop = before + Math.max(40, box.clientHeight * 0.8);
      await sleep(50);
      const hit = findByHints(findVisibleOptions(), wanted, textsOf);
      if (hit) return hit;
      if (box.scrollTop === before) break; // reached the end of the list
    }
    box.scrollTop = 0;
    await sleep(50);
    return null;
  }

  function scrollableAncestor(n) {
    // (Inside the open list, a box with "overflow: hidden" scrolls too: virtual lists such as Ant
    // Design's draw their own scroll bar and follow scrollTop.)
    const list = n && n.closest && n.closest(POPUP_SEL);
    for (let p = n && n.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || (oy === 'hidden' && list && list.contains(p))) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return null;
  }

  // Leave no list open — also an empty one ("No matches"). Escape is never used (it would
  // also close a surrounding dialog). Until the list is gone: move focus out of the
  // dropdown and its list; click the list's own "click outside" layer; click the
  // dropdown's own toggle; click the form's background next to it, as a person would.
  // Open or not: a dropdown's aria-expanded is believed only when it was seen to change
  // as the list opened (some pages never update it), and — when its list is known — only
  // while that list is still on screen (some leave aria-expanded "true" after a pick).
  // Without it, what is on screen counts, after any fade-out has finished.
  let activeClose = null; // { el, trigger, popupsBefore, ariaLive, list } of the dropdown being filled
  // Dropdowns whose list FillCraft could not close in this fill (reported as leftOpen), and what
  // was tried for each (for the report).
  let listsLeftOpen = new Set();
  let closeTrace = new Map();
  async function closeDropdown(el) {
    const ctx = activeClose && activeClose.el === el ? activeClose : null;
    const trigger = ctx ? ctx.trigger : el;
    const panelShown = () => (ctx && ctx.panel && ctx.panel.isConnected && isShown(ctx.panel) ? ctx.panel : null);
    const listNow = () => (ctx ? ownOpenList(el, trigger, ctx.popupsBefore) || panelShown() : controlledPopup(el));
    const visible = () => !!listNow() || findVisibleOptions().length > 0;
    const ariaLive = !!(ctx && ctx.ariaLive);
    const listKnown = !!(ctx && ctx.list);
    const isOpen = () => (ariaLive ? saysExpanded(el, trigger) && (!listKnown || visible()) : visible());
    // (Each step tried, for the report when the list stays open.)
    const steps = [];
    const finish = (open) => {
      if (ctx) { if (open) { listsLeftOpen.add(el); closeTrace.set(el, { steps, list: structureOf(listNow(), 1) }); } else { listsLeftOpen.delete(el); closeTrace.delete(el); } }
      return !open;
    };
    // Let the page finish what a pick scheduled (Tom Select re-focuses itself on a 0 ms timer):
    // moving the focus away first left that timer re-opening the list later, in a fight for the
    // focus with the next dropdown. A person's pause between two clicks is longer than this.
    await sleep(40);
    const list0 = listNow();
    const pop0 = list0 && (list0.closest(POPUP_ROOT_SEL) || list0);
    const a = document.activeElement;
    if (a && a !== document.body && typeof a.blur === 'function' && (el.contains(a) || a === el || (pop0 && pop0.contains(a)))) { a.blur(); steps.push('moved the focus out'); }
    // Most lists close by themselves after a pick or a blur — give them a moment, and let a
    // list that is only fading out finish.
    if (await waitUntil(() => !isOpen(), ariaLive ? 200 : 400)) return finish(false);
    await settleAnimations(listNow() || list0);
    if (!isOpen()) return finish(false);
    const done = async () => { await waitUntil(() => !isOpen(), 300); return finish(isOpen()); };
    // The list's own "click outside" layer (Angular Material / CDK, MUI menus) — only the
    // one that belongs to this list.
    const layer = ownBackdrop(listNow(), el);
    if (layer) {
      steps.push('clicked its own outside layer');
      await clickOption(layer, () => !isOpen());
      if (!isOpen()) return done();
    }
    if (!ctx) return !isOpen();
    // Its own box, when the focus is not in it: into it, then away — as a person clicks in and
    // out. (A Mantine list opened while its box had no focus closes only on that box's blur.)
    const box = el.matches('input:not([type=hidden]), textarea') ? el : el.querySelector('input:not([type=hidden]):not([readonly]), input[role="combobox"]');
    if (box && isOpen() && document.activeElement !== box && (!fillScope || containsDeep(fillScope, box))) {
      steps.push('focused its box, then moved the focus out');
      try { box.focus({ preventScroll: true }); } catch (_) { /* not focusable */ }
      await sleep(40);
      if (document.activeElement === box) box.blur();
      if (await waitUntil(() => !isOpen(), 400)) return done();
    }
    // The dropdown's own toggle — only while the list is really open.
    const toggle = dropdownToggle(el, trigger);
    if (toggle && isOpen()) {
      steps.push('clicked its toggle ' + ((structureOf(toggle, 0) || {}).t || ''));
      fireOpenStrong(toggle);
      if (await waitUntil(() => !isOpen(), 400)) return done();
    }
    // The form's background next to it: a click outside the list.
    if (isOpen()) {
      const spot = neutralSpotNear(el, listNow() || list0);
      if (spot) {
        steps.push('clicked beside the form\'s fields ' + ((structureOf(spot, 0) || {}).t || ''));
        await clickOption(spot, () => !isOpen(), 300);
        if (!isOpen()) return done();
      }
    }
    if (isOpen()) console.info('[FillCraft] A dropdown list stayed open after every way of closing it:', el);
    return finish(isOpen());
  }

  // After a fill: no list may stay open. A dropdown FillCraft used in this fill (typed
  // into or opened) that still says it is expanded AND still shows its list is closed with
  // its own closing steps. Anything else — popups FillCraft did not open (a popover form,
  // a hint, an inline list the page revealed), or a dropdown whose aria-expanded is stuck
  // with nothing on screen — is left alone.
  const EXPANDED_LIST_SEL = '[role="combobox"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]';
  let touchedFields = new Set(); // fields FillCraft filled or opened in this fill
  async function closeLeftoverLists(popupsBefore, expandedBefore) {
    const usedByUs = (n) => { const r = dropdownRoot(n); return Array.from(touchedFields).some((t) => t.isConnected && (t === r || r.contains(t) || t.contains(n))); };
    const owners = () => Array.from(document.querySelectorAll(EXPANDED_LIST_SEL))
      .filter((n) => !expandedBefore.has(n) && isShown(n) && inFillScope(n) && !isInNavRegion(n) && usedByUs(n));
    if (!owners().length) return;
    const a = document.activeElement;
    if (a && a !== document.body && typeof a.blur === 'function' && owners().some((o) => { const r = dropdownRoot(o); return r.contains(a) || r === a; })) a.blur();
    if (await waitUntil(() => !owners().length, 400)) return;
    for (const o of owners()) {
      const root = dropdownRoot(o);
      // (Not recognised as its list: a pop-up that appeared right next to it during the fill.)
      const list = ownOpenList(root, o, popupsBefore) ||
        shownPopups().find((p) => !popupsBefore.has(p) && !containsDeep(p, root) && isNearField(p, root)) || null;
      if (!list) continue; // says expanded, shows nothing: nothing to close
      // (Its aria-expanded changed to "true" during the fill: it is known to work.)
      activeClose = { el: root, trigger: o, popupsBefore, ariaLive: true, list };
      try { await closeDropdown(root); } catch (_) { /* next one */ } finally { activeClose = null; }
    }
  }

  // An option the library marks as chosen (ARIA, Angular/MDC, MUI, React-Select, Ant).
  // The checkbox (or radio) of an option's row: inside the option, or — when the option is
  // the row's text — beside it in the row (the nearest box holding exactly one).
  function rowCheckbox(o) {
    const SEL = 'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]';
    const own = o.querySelector && o.querySelector(SEL);
    if (own) return own;
    // (Only a box that holds just this row — never a list's "Select all" box.)
    const own_t = (o.textContent || '').trim().length;
    for (let p = o.parentElement, i = 0; p && p !== document.body && i < 3; p = p.parentElement, i++) {
      if ((p.textContent || '').trim().length > own_t + 12) return null;
      const boxes = p.querySelectorAll(SEL);
      if (boxes.length === 1) return boxes[0];
      if (boxes.length > 1) return null;
    }
    return null;
  }
  const isBoxTicked = (box) => !!box && (box.checked || box.getAttribute('aria-checked') === 'true' ||
    !!box.closest('.Mui-checked, .ant-checkbox-checked, .p-checkbox-checked, .is-checked, .el-checkbox.is-checked'));

  function isOptionSelected(o) {
    // A row of a checkbox list: its box is ticked.
    if (isBoxTicked(rowCheckbox(o))) return true;
    // Mantine marks the row under the mouse aria-selected (with data-hovered); the chosen
    // one is data-selected.
    if (o.hasAttribute('data-hovered')) return o.hasAttribute('data-selected');
    return o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-checked') === 'true' ||
      /(^|\s)(mdc-list-item--selected|mat-mdc-option-multiple.*mdc-list-item--selected|Mui-selected|ant-select-item-option-selected|select2-results__option--selected)(\s|$)/.test(o.className || '') ||
      /(__option|-option)--is-selected/.test(o.className || '');
  }

  // Did the dropdown take the selection? Its visible text or its inner input now
  // shows the chosen option, or its text changed from what it was to a real value.
  function selectionShows(el, wanted, beforeText, target) {
    if (target && target.isConnected && isOptionSelected(target)) return true;
    const w = wanted.toLowerCase();
    // The option as a whole word ("Female" does not show "Male") that was not already there
    // before the pick (a placeholder "Select…" contains "CT", "Nothing selected" contains "No").
    const shows = (text) => {
      if (!w) return false;
      const t = String(text || '').toLowerCase();
      const at = t.indexOf(w);
      if (at < 0) return false;
      const ok = (i) => { const before = t[i - 1], after = t[i + w.length]; return (!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after)); };
      for (let i = at; i >= 0; i = t.indexOf(w, i + 1)) if (ok(i)) return true;
      return false;
    };
    const wasThere = shows(beforeText);
    // (What the field shows — not a list drawn inside it, nor that list's search box.)
    const now = valueText(el);
    if (!wasThere && shows(now) && !findVisibleOptions().some((o) => el.contains(o))) return true;
    for (const i of el.querySelectorAll('input')) {
      const list = i.closest(LIST_IN_FIELD_SEL);
      if (list && list !== el && el.contains(list)) continue;
      if (shows(i.value)) return true;
    }
    if (el.tagName === 'INPUT' && shows(el.value)) return true;
    // (Not while the open list is rendered INSIDE el — its option text would count.)
    return !!now && now !== beforeText && !isPlaceholderText(now) &&
      !findVisibleOptions().some((o) => el.contains(o));
  }

  // The component root of a dropdown, given any element inside it (e.g. React-Select's
  // search <input> → its "…-control" box that shows the selected value).
  function dropdownRoot(el) {
    const root = el.closest && el.closest('[class*="__control"], [class*="-control"]:not(input), .MuiAutocomplete-root, .MuiSelect-select, .ant-select, .select2-container, .choices__inner, .el-select__wrapper, .v-field[role="combobox"], .p-dropdown, .p-multiselect');
    if (root && root !== document.body) return root;
    // Search box + its own list button (Headless UI, React Aria): the small box holding both.
    if (el.tagName === 'INPUT' && el.getAttribute && el.getAttribute('role') === 'combobox' && listButtonBeside(el)) return pairRoot(el);
    if (el.matches && el.matches('button[aria-haspopup="listbox"], [role="button"][aria-haspopup="listbox"]')) {
      const input = comboboxOfButton(el);
      if (input) return pairRoot(input);
    }
    return el;
  }

  // Part of an open list / menu (its options, its messages) — never a dropdown itself.
  // Library list popups count; a MUI Popover or Vuetify menu only when it holds a list (not
  // a small form); a generic "…-menu" class only on a popup drawn above the page (not
  // <body class="has-side-menu">, a nav bar or a page section).
  const OPEN_MENU_SEL = '[role="listbox"], [role="menu"], [role="option"], [class*="__menu"], [class*="-menu-notice"], [class*="MenuList"], .MuiAutocomplete-popper, .ant-select-dropdown, .el-select-dropdown, .ts-dropdown, .select2-dropdown, .choices__list--dropdown';
  function isInsideOpenMenu(el) {
    // (A field that calls ITSELF a listbox while it opens a list of its own — Choices.js without a
    // search box: role="listbox" + aria-haspopup — is a dropdown, not an open menu.)
    const menu = el.closest(OPEN_MENU_SEL);
    if (menu && !(menu.matches('[role="listbox"]') && (menu.getAttribute('aria-haspopup') || 'false') !== 'false' && !menu.parentElement?.closest(OPEN_MENU_SEL))) return true;
    const pop = el.closest('.MuiPopover-root, .v-overlay__content');
    if (pop && !pop.matches('.v-dialog > .v-overlay__content, .v-bottom-sheet > .v-overlay__content') &&
        pop.querySelector('[role="listbox"], [role="menu"], .MuiMenu-list, .v-list') && !pop.querySelector('.MuiFormControl-root, .v-field, form')) return true;
    const m = el.closest('[class*="-menu"]:not([class*="-menu-"])');
    if (m && m !== document.body && m !== document.documentElement) {
      const pos = getComputedStyle(m).position;
      if ((pos === 'absolute' || pos === 'fixed') && !m.querySelector('form')) return true;
    }
    return false;
  }


  // A dropdown the page has disabled (React-Select / MUI / Ant / ARIA conventions).
  function isDisabledDropdown(el) {
    const n = el.closest('[aria-disabled="true"], [class*="--is-disabled"], [class*="is-disabled"], .Mui-disabled, .ant-select-disabled, [disabled]');
    if (n) return true;
    const input = el.querySelector && el.querySelector('input');
    return !!(input && input.disabled);
  }

  // Required, for a custom dropdown: aria-required on it or its inner input, or a "*" /
  // "(required)" on its label.
  function isDropdownRequired(el) {
    if (el.getAttribute('aria-required') === 'true' || el.querySelector?.('[aria-required="true"], [required]')) return true;
    if (el.closest('[aria-required="true"]')) return true;
    const backing = backingSelectOf(el);
    if (backing && (backing.required || backing.getAttribute('aria-required') === 'true')) return true;
    return labelSaysRequired(dropdownLabelText(el));
  }

  // ---------- Custom dropdown discovery (shared by fill and detect) ----------
  // Returns [{ control, key }] in fill order (country before state).
  // A field's own error / help message (never a control): only libraries' message elements.
  const FIELD_MESSAGE_SEL = '.mantine-InputWrapper-error, .mantine-InputWrapper-description, .mantine-InputWrapper-label,.MuiFormHelperText-root, mat-error, mat-hint, .mat-mdc-form-field-error, .mat-mdc-form-field-hint, .ant-form-item-explain, .invalid-feedback, .valid-feedback, .form-text, .help-block, .v-messages, .p-error, .el-form-item__error';
  function discoverCustomDropdowns() {
    // Three discovery methods, merged with label-driven taking priority since
    // it has explicit classification.
    const labelDropdowns    = findDropdownsByLabel();                                     // [{control, key}]
    const selectorDropdowns = collectCustomDropdowns().map(c => ({ control: c, key: null }));

    const allDropdowns = [];
    for (const item of [...labelDropdowns, ...selectorDropdowns]) {
      if (!item.control) continue;
      // Work with the whole dropdown component, not its inner search box: that is
      // where the chosen value is displayed (and what a person would call the field).
      item.control = dropdownRoot(item.control);
      if (!inFillScope(item.control)) continue;
      if (item.control.closest(FREE_TEXT_COMBOBOX_SEL) && isCustomDropdownFilled(item.control)) continue; // typed as text (Pass A)
      // An open menu, its options and its messages ("No options", "Loading…") are
      // part of a dropdown, not dropdowns themselves.
      if (isInsideOpenMenu(item.control)) continue;
      // A link (heading anchors, "copy link" icons) is never a dropdown; nor is a section
      // that CONTAINS dropdowns or native selects (Pass 1 fills native selects).
      if (item.control.closest('a[href]')) continue;
      // Nor a field's error / help message ("Select a program" under a Mantine Select).
      if (item.control.closest(FIELD_MESSAGE_SEL)) continue;
      // Nor the icon area beside a dropdown's own box (Mantine 7's chevron — where its clear "×"
      // shows once a value is chosen): it is part of that dropdown.
      const c0 = item.control;
      if (!c0.matches('input, select, textarea, button, [role="combobox"], [aria-haspopup]') && !(c0.textContent || '').trim() && c0.parentElement &&
          c0.parentElement.querySelector(':scope > input[aria-haspopup="listbox"], :scope > input[role="combobox"], :scope > [role="combobox"]')) continue;
      // (Only a VISIBLE native select counts: libraries like Choices.js / Select2 keep
      // the original select hidden inside their component — that one is theirs to fill.)
      // (A widget's own hidden helpers — PrimeReact's 1-pixel <select> and input — do not count.)
      const helper = (n) => { const r = n.getBoundingClientRect(); return r.width <= 2 || r.height <= 2 || !!n.closest('[class*="hidden-accessible" i], .sr-only, .visually-hidden'); };
      if (item.control.tagName !== 'SELECT' && Array.from(item.control.querySelectorAll('select')).some((s) => isVisible(s) && !helper(s) && !isWidgetBackingSelect(s))) continue;
      const innerDropdowns = Array.from(item.control.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], mat-select'))
        .filter((n) => !helper(n) && !(n.matches('button[aria-haspopup="listbox"], [role="button"][aria-haspopup="listbox"]') && comboboxOfButton(n)));
      if (innerDropdowns.length > 1) continue;
      // Action / navigation menus (⋮ buttons, account menus…) are never form dropdowns.
      if (isActionMenuTrigger(item.control) || item.control.querySelector?.('[aria-haspopup="menu"], [aria-haspopup="true"]:not([role="combobox"])')) continue;

      // Skip flag/dial-code dropdowns inside phone widgets. The phone INPUT next to them
      // gets filled in Pass 1; touching the flag dropdown would change the country and
      // can cause the library to reformat / clear the number.
      if (isInsidePhoneWidget(item.control) || isPhoneFlagDropdown(item.control)) continue;

      // If a related (parent / child / same) dropdown is already in the list, merge.
      const existing = allDropdowns.find(a =>
        a.control === item.control ||
        a.control.contains(item.control) ||
        item.control.contains(a.control)
      );
      if (existing) {
        // Prefer the label-driven entry (explicit key) and the more specific (deeper) control.
        if (item.key && !existing.key) existing.key = item.key;
        if (existing.control.contains(item.control) && item.control !== existing.control) {
          existing.control = item.control;
        }
        continue;
      }
      allDropdowns.push({ control: item.control, key: item.key });
    }

    // Resolve each dropdown's key once (label-driven key first, else its own text) — your
    // setting for it on this site first of all.
    for (const item of allDropdowns) {
      const rule = ruleFor(item.control);
      item.key = rule ? (rule.type === 'leave' ? LEAVE : rule.type) : item.key || classifyCustomDropdown(item.control);
    }

    // Country MUST be selected before State.
    const isCountryKey = (k) => k === 'country' || k === 'countryCode';
    const isStateKey   = (k) => k === 'state' || k === 'stateName';
    const orderRank = (item) => {
      const k = item.key;
      if (isCountryKey(k)) return 0;
      if (isStateKey(k))   return 1;
      return 2;
    };
    allDropdowns.sort((a, b) => orderRank(a) - orderRank(b));
    return allDropdowns;
  }

  // ---------- Choice groups without real radio buttons ----------
  // ARIA radio groups made of <div role="radio">, and toggle-button groups (Angular
  // mat-button-toggle-group, MUI ToggleButtonGroup, aria-pressed button groups) that
  // work like radio buttons. To keep toolbars out, a group must have a label, 2–8 short
  // options, and no links / submit buttons / text fields inside.
  const CHOICE_OPTION_SEL = '[role="radio"], [role="option"][aria-checked], button[aria-pressed], .mat-button-toggle-button, .MuiToggleButton-root';

  function discoverChoiceGroups() {
    const found = [];
    const containers = document.querySelectorAll('[role="radiogroup"], mat-button-toggle-group, .mat-button-toggle-group, .MuiToggleButtonGroup-root, [role="group"]');
    for (const c of containers) {
      if (!isShown(c) || isInNavRegion(c) || !inFillScope(c) || c.closest('[role="toolbar"], [role="menubar"], [role="tablist"]')) continue;
      if (c.querySelector('input[type="radio"]')) continue; // real radios: filled as form fields
      if (c.querySelector('a[href], [type="submit"], input:not([type="hidden"]), select, textarea')) continue;
      let options = Array.from(c.querySelectorAll(CHOICE_OPTION_SEL)).filter((o) => isShown(o));
      options = options.filter((o) => !options.some((p) => p !== o && p.contains(o)));
      if (options.length < 2 || options.length > 8) continue;
      if (options.some((o) => choiceText(o).length === 0 || choiceText(o).length > 40)) continue;
      const label = choiceGroupLabel(c);
      if (!label) continue; // an unlabelled row of buttons is a toolbar, not a question
      found.push({ container: c, options, label, required: c.getAttribute('aria-required') === 'true' || labelSaysRequired(label) });
    }
    // Keep the innermost group when groups are nested.
    return found.filter((g) => !found.some((o) => o !== g && g.container.contains(o.container)));
  }

  function choiceText(o) {
    return tidy(o.getAttribute('aria-label') || o.textContent || o.getAttribute('value') || '', 60);
  }

  function choiceGroupLabel(c) {
    const aria = c.getAttribute('aria-label') ||
      (c.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    if (aria && aria.trim()) return tidy(aria, 60);
    const legend = c.closest('fieldset')?.querySelector('legend');
    if (legend && legend.textContent.trim()) return tidy(legend.textContent, 60);
    const wrap = c.closest('mat-form-field, .MuiFormControl-root, [class*="form-group" i], [class*="form-field" i]');
    const wrapLabel = wrap && wrap.querySelector('label, mat-label, .MuiFormLabel-root');
    if (wrapLabel && !c.contains(wrapLabel) && wrapLabel.textContent.trim()) return tidy(wrapLabel.textContent, 60);
    return tidy(nearestPrecedingLabel(c) || precedingColumnText(c, Array.from(c.querySelectorAll('*'))), 60);
  }

  // Selected per ARIA (aria-checked / aria-pressed) or the libraries' own classes.
  function isChoiceSelected(o) {
    if (o.getAttribute('aria-checked') === 'true' || o.getAttribute('aria-pressed') === 'true') return true;
    if (o.closest('.mat-button-toggle-checked')) return true;
    return /(^|\s)(Mui-selected|selected|is-selected|active)(\s|$)/.test(typeof o.className === 'string' ? o.className : '');
  }

  async function fillChoiceGroup(g, key, dataset, opts, limit) {
    if (limit === 'under' || limit === 'over') return { ok: null, reason: 'A choice list has nothing outside its options' };
    const strategy = limit === 'min' ? 'first' : limit === 'max' ? 'last' : opts.dropdownStrategy;
    const pickable = g.options.filter((o) => !o.disabled && o.getAttribute('aria-disabled') !== 'true');
    if (!pickable.length) return { ok: null, reason: 'Disabled on the page' };
    const target = chooseOption(pickable, key ? getSelectHints(key, dataset) : null,
      (o) => [o.getAttribute('value') || '', choiceText(o)], strategy);
    if (!target) return { ok: false, reason: 'No option could be chosen' };
    // Already the selected one: clicking a toggle button again would turn it off.
    if (isChoiceSelected(target)) return { ok: true, value: choiceText(target) };
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    fireOpenStrong(target);
    for (let i = 0; i < 12 && !isChoiceSelected(target); i++) await sleep(25);
    return isChoiceSelected(target)
      ? { ok: true, value: choiceText(target) }
      : { ok: false, reason: 'The option did not stay selected', value: '—' };
  }

  // A value-free description of an element for the diagnostics report: tag, type,
  // role, name/id, a few ARIA attributes and classes for it and 2 parents — never its
  // value or text, so no patient data can leave the page.
  function describeElement(el) {
    const one = (n) => {
      if (!n || !n.tagName) return '';
      let s = n.tagName.toLowerCase();
      for (const a of ['type', 'role', 'name', 'id', 'formcontrolname', 'aria-haspopup', 'aria-autocomplete', 'aria-required', 'data-testid']) {
        const v = n.getAttribute && n.getAttribute(a);
        if (v) s += `[${a}=${String(v).slice(0, 40)}]`;
      }
      // (FillCraft's own highlight classes are not the page's.)
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/).filter((c) => c && !c.startsWith(HIGHLIGHT_CLASS)).slice(0, 4).join('.') : '';
      return cls ? `${s}.${cls}` : s;
    };
    const chain = [];
    let n = el;
    for (let i = 0; n && i < 3; i++, n = n.parentElement) chain.push(one(n));
    return chain.join(' < ').slice(0, 400);
  }

  // The structure of an element for a failure report: tags, classes, roles / ARIA, a few levels
  // deep — never its text (only how long it is) or values; long numbers in attributes masked.
  function structureOf(e, depth = 2, kids = 3) {
    if (!e || !e.tagName) return null;
    const mask = (v) => String(v).replace(/\d{3,}/g, '#');
    const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => c && !c.startsWith(HIGHLIGHT_CLASS)).slice(0, 5).map(mask).join('.') : '';
    const a = Array.from(e.attributes).filter((x) => /^(role|aria-(?!label|valuetext|description|placeholder)|type|readonly|tabindex|data-testid|data-(selected|hovered|disabled|outside))/.test(x.name))
      .map((x) => x.name + (x.value ? '=' + mask(x.value.slice(0, 30)) : '')).join(' ');
    const out = { t: e.tagName.toLowerCase() + (cls ? '.' + cls : '') };
    if (a) out.a = a;
    if (!e.children.length) { const n = (e.textContent || '').trim().length; if (n) out.x = `(text, ${n} chars)`; }
    else if (depth > 0) {
      out.k = Array.from(e.children).slice(0, kids).map((c) => structureOf(c, depth - 1, kids));
      if (e.children.length > kids) out.more = e.children.length - kids;
    }
    return out;
  }
  // What a text box the page emptied asks for — its structure and declared rules, and how long the
  // value FillCraft entered was (never the value itself): enough to see a format the page wants.
  function textFieldRules(el, enteredLength) {
    return { field: structureOf(el, 0), maxLength: el.maxLength, minLength: el.minLength, pattern: el.getAttribute('pattern') || null,
      inputMode: el.inputMode || null, placeholderLength: (el.placeholder || '').length, enteredLength };
  }
  // What the last custom dropdown fill saw and did (structure only) — attached to its row when it
  // fails, for the copied troubleshooting report.
  let lastDropdownDiag = null;

  // A password that was already on the page: shown as dots (the page hides it too).
  const maskedValue = (el) => (el.value ? '•'.repeat(Math.min(8, el.value.length)) + ' (hidden)' : '—');

  // ---------- Main fill routine ----------
  // Guards against a second fill (e.g. popup click + keyboard shortcut) starting while
  // one is still typing into this page. Stored on window so it survives re-injection.
  async function fillForm(payload) {
    if (window.__qaFormFillerBusy) return { error: 'A fill is already running on this page' };
    window.__qaFormFillerBusy = true;
    // (The runner's start time: a Stop pressed while the engine was still loading counts too.)
    runStartedAt = Number(payload && payload.startedAt) || Date.now();
    try {
      return await fillFormInner(payload);
    } finally {
      window.__qaFormFillerBusy = false;
      runStartedAt = 0;
      ruleTarget = null;
    }
  }

  // ---------- Stop (the person pressed Stop in the popup) ----------
  // The runner marks the time Stop was pressed (window.__qaFormFillerStopAt, in this isolated
  // world); a fill that started before then stops after the field it is working on — it
  // closes what it opened and reports what it did. A Stop from an earlier fill is older than
  // this fill's start and changes nothing.
  let runStartedAt = 0;
  const userStopped = () => runStartedAt > 0 && Number(window.__qaFormFillerStopAt || 0) >= runStartedAt;
  const USER_STOP_REASON = 'Not finished — you stopped the fill';

  // Collected fields as fillable units: one per field, but one per radio group.
  function toUnits(elements) {
    const inSet = new Set(elements);
    const seenGroups = new Set();
    const units = [];
    for (const el of elements) {
      if (el.type === 'radio') {
        const group = radioGroupOf(el).filter((r) => inSet.has(r));
        if (!group.length) group.push(el);
        if (seenGroups.has(group[0])) continue;
        seenGroups.add(group[0]);
        units.push({ el: group[0], group });
      } else {
        units.push({ el, group: null });
      }
    }
    return units;
  }

  // ---------- Per-run log + element registry ----------
  // Each frame remembers the elements it reported on, so the popup can point at one
  // later ("reveal"). Log entries reference them by index.
  function resetRegistry() { window.__qaFormFillerEls = []; }
  function register(el) {
    const list = window.__qaFormFillerEls || (window.__qaFormFillerEls = []);
    list.push(el);
    return list.length - 1;
  }

  const tidy = (s, n = 60) => {
    const t = String(s == null ? '' : s).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };

  // What a person would call the field: its label (a radio group's question), else
  // aria-label / placeholder / name / id.
  function fieldLabel(el, group, custom) {
    // Boxes 2/3 of a split phone: "Home phone (part 2)". (Box 1 is never el here, so
    // this cannot recurse.)
    if (!custom && !group && !getLabelText(el) && splitPhoneSiblingKey(el)) {
      const boxes = splitPhoneGroup(el);
      const first = boxes[0] !== el ? fieldLabel(boxes[0]) : 'Phone';
      return `${first} (part ${boxes.indexOf(el) + 1})`;
    }
    // The first candidate that is more than a required mark: a label that is only "*" (the
    // real name drawn elsewhere) moves on to the next candidate.
    const clean = (s) => tidy(String(s || '').replace(/\s*[*:]+\s*$/, ''), 50);
    const firstOf = (...candidates) => { for (const c of candidates) { const t = clean(c()); if (t) return t; } return ''; };
    let t;
    if (custom) {
      // A custom dropdown: its label, a label column, its aria-label, else its placeholder
      // text without the "Select" ("Select City" → "City").
      const innerLabel = el.querySelector ? el.querySelector('label, legend, [class*="InputLabel" i]') : null;
      t = firstOf(
        () => innerLabel && innerLabel.textContent.trim(),
        () => dropdownLabelText(el),
        () => precedingColumnText(el, Array.from(el.querySelectorAll(FIELD_SELECTOR)).concat(el)),
        () => el.getAttribute('aria-label'),
        () => (isPlaceholderText(textWithoutLabels(el)) ? textWithoutLabels(el).replace(/^\s*(please\s+)?(select|choose|pick)\s+(an?\s+)?/i, '') : ''),
      );
    } else if (group) {
      t = firstOf(() => groupLabel(el), () => el.name);
    } else {
      t = firstOf(() => getLabelText(el), () => el.getAttribute('aria-label'), () => el.placeholder, () => el.name, () => el.id);
    }
    return t || noLabelName(el, custom);
  }

  // A field with no name of its own, described by what it is ("Dropdown with no label").
  function noLabelName(el, custom) {
    const type = (el.type || '').toLowerCase();
    if (custom || el.tagName === 'SELECT') return 'Dropdown with no label';
    if (el.tagName === 'TEXTAREA') return 'Text box with no label';
    if (type === 'checkbox') return 'Checkbox with no label';
    if (type === 'radio') return 'Choice with no label';
    if (type === 'file') return 'Upload with no label';
    return 'Field with no label';
  }

  // What the field holds now, as the user would see it.
  function displayValue(el, group, custom) {
    if (custom) {
      // Multi-selects show one chip per value: list them "Purple, Red".
      const chips = el.querySelectorAll('[class*="multi-value__label"], [class*="multiValue"] [class*="label" i], .MuiChip-label, .ant-select-selection-item-content, .select2-selection__choice__display, .choices__item--selectable');
      const chosen = Array.from(chips).filter((c) => !c.closest('.choices__list--dropdown, [role="listbox"]')).map((c) => c.textContent.trim()).filter(Boolean);
      if (chosen.length) return tidy(Array.from(new Set(chosen)).join(', '));
      // A custom dropdown shows its value in its text or its inner input (not its label) —
      // or, when it is a read-only box itself, in its own value.
      if (el.tagName === 'INPUT') return tidy(el.value || '') || '—';
      const input = el.querySelector && el.querySelector('input:not([type=hidden])');
      const t = tidy((input && input.value) || textWithoutLabels(el));
      return t && !isPlaceholderText(t) ? t : '—';
    }
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox') return el.checked ? 'Checked' : 'Unchecked';
    if (type === 'radio') {
      const c = (group || radioGroupOf(el)).find((r) => r.checked);
      return c ? tidy(getLabelText(c) || c.value) : '—';
    }
    if (el.tagName === 'SELECT') {
      // (A chosen "None" / "N/A" is shown as such — only "Select…"-style prompts count as empty.)
      const picked = Array.from(el.selectedOptions || []).filter((o) => o.value !== '' && !(isPlaceholderText(o.textContent) && !/^\s*(none|n\/a)\b/i.test(o.textContent)));
      return tidy(picked.map((o) => o.textContent.trim()).join(', ')) || '—';
    }
    const v = typeof el.value === 'string' ? el.value : tidy(el.textContent);
    if (v === '') return '—';
    if (v.trim() === '') return `(${v.length} spaces)`;
    if (v.length > 60) return `${tidy(v, 40)} (${v.length} chars)`;
    // Spaces around a value are shown (␣), so a "Leading / trailing spaces" value is visible.
    const lead = v.length - v.trimStart().length;
    const trail = v.length - v.trimEnd().length;
    if (lead || trail) return '␣'.repeat(Math.min(lead, 5)) + tidy(v) + '␣'.repeat(Math.min(trail, 5));
    return tidy(v);
  }

  // Strategy 1: native setter + events. Strategy 2, if the page rejected or cleared
  // it (typical of input masks): type it key by key. Typing is skipped for types
  // where it cannot help and for long values (it is ~20 ms per character).
  const NO_TYPING = ['number', 'email', 'date', 'month', 'week', 'time', 'datetime-local', 'range', 'color'];
  // "Kept" = the page did not throw the value away: the field is not empty and did not
  // snap back to what it held before (date pickers / masks revert rejected input on
  // blur — that must count as rejected, not filled).
  async function setTextWithRetry(el, value) {
    const before = el.value;
    const kept = () => (value === '' ? el.value === '' : el.value !== '' && !(el.value === before && value !== before) &&
      !showsMaskTemplate(el.value, value));
    if (setText(el, value) && kept()) return true;
    const type = (el.type || '').toLowerCase();
    if (value.length > 100 || NO_TYPING.includes(type)) return false;
    await typeSlowly(el, value, 18);
    if (kept()) return true;
    // A mask that mangles keys appended to its template: give it the text typed so far.
    await typeProgressively(el, value, 18);
    if (document.activeElement === el) el.blur();
    if (kept()) return true;
    // Never leave half a mask behind.
    if (showsMaskTemplate(el.value, value)) { nativeSet(el, ''); fireEvents(el); }
    return false;
  }

  // What a checkbox means, by its label / name / id — shared by the single box and the group pass.
  function checkboxKind(el) {
    const labelText = (getLabelText(el) + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const consent = /(agree|accept|terms|consent|hipaa|authoriz|acknowledg|certify)/i.test(labelText);
    const noneChoice = /^\s*(none|n\/a|not\s+applicable|none\s+of\s+the\s+above|no\s+known\b.*)\s*$/i.test(getLabelText(el) || el.value || '');
    // Boxes that change what a record IS (deceased, inactive, delete, do not contact…):
    // realistic data leaves them unticked.
    // …and "Doesn't have NPI number" / "No middle name"-style boxes, which switch a field
    // off: realistic data has the value, so they stay unticked and the field is filled.
    // (Record-changing boxes stay unticked with Invalid and Edge data too: ticking "Delete" is
    // not invalid data.)
    const changesRecord = /deceased|\bdied\b|expired|inactive|deactivat|terminat|archiv|\bdelete|\bremove|opt[\s-]*out|unsubscribe|do\s*n[o']t\s+(contact|call|e-?mail|text|resuscitate|send)|\bdnr\b|no\s+longer|discontinu|\bcancel|\bvoid\b|\bmerge\b|duplicate|mark\s+as\s+(test|spam)/i.test(labelText);
    const risky = changesRecord ||
      /does\s*n[o']?t\s+have|do\s*n[o']?t\s+have|does\s+not\s+have|i\s+have\s+no\b|not\s+applicable|\bn\/a\b|do\s*n[o']?t\s+know|unknown|no\s+(npi|dea|license|ssn|social|e-?mail|phone|insurance|middle\s+name|suffix)\b/i.test(labelText);
    return { labelText, consent, noneChoice, changesRecord, risky };
  }

  // Fills one unit. Returns { ok: true } (filled), { ok: false, reason } (the page
  // rejected it) or { ok: null, reason } (left empty on purpose).
  async function fillOne(el, group, key, mode, dataset, opts) {
    touchedFields.add(el);
    if (isOneTimeCode(el)) return { ok: null, reason: 'Verification code — only the person who receives it knows it' };
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const strategy = opts.dropdownStrategy || 'match';
    // Per-field boundary edge types: limit-min / limit-under / limit-max / limit-over.
    const limit = mode === 'edge' && /^limit-/.test(opts.edgeType || '') ? opts.edgeType.slice(6) : null;
    const REJECTED = 'The field rejected the value';

    if (type === 'checkbox') {
      if (limit) return { ok: null, reason: 'A checkbox has no limits to test' };
      const { labelText, consent, noneChoice, changesRecord, risky } = checkboxKind(el);
      let target;
      if (mode === 'valid') target = noneChoice || risky ? false : consent || /(subscribe|newsletter|opt[-\s]?in)/i.test(labelText) || Math.random() < 0.5;
      else if (changesRecord) target = false;
      else if (mode === 'invalid') target = !consent; // leave consent unticked, tick the rest
      else target = Math.random() < 0.5;
      setCheckbox(el, target);
      return { ok: el.checked === target, reason: 'The checkbox did not change when clicked' };
    }

    // Choice fields: boundary "min"/"max" = first/last option; nothing lies outside the list.
    if (tag === 'select' && el.multiple && el.options.length === 0) {
      if (limit) return { ok: null, reason: 'A transfer list has no limits to test' };
      return (await fillTransferList(el)) ? { ok: true } : { ok: null, reason: 'Nothing to move into this list' };
    }
    if (type === 'radio' || tag === 'select') {
      if (limit === 'under' || limit === 'over') return { ok: null, reason: 'A choice list has nothing outside its options' };
      // Valid data with nothing for this field (a suffix most people do not have): its "None"
      // choice if it has one, otherwise left as it is — never a random suffix.
      if (mode === 'valid' && !limit && key && dataset[key] === '') {
        // (A self-pay patient's insurance carrier: "Self Pay", "Uninsured", "No insurance".)
        const NONE = /^\s*(none|n\/a|not\s+applicable|no\s+suffix|no\s+prefix|self[\s-]*pay|uninsured|no\s+insurance)\s*$/i;
        if (type === 'radio') {
          const r = (group || [el]).find((x) => !x.disabled && NONE.test(getLabelText(x) || x.value || ''));
          if (!r) return { ok: null, reason: 'Left empty on purpose (this person has none)' };
          if (!r.checked) r.click();
          return { ok: r.checked, reason: 'The option did not stay selected' };
        }
        const o = Array.from(el.options).find((x) => !x.disabled && NONE.test(x.textContent || ''));
        if (!o) return { ok: null, reason: 'Left empty on purpose (this person has none)' };
        if (!o.selected) { o.selected = true; fireEvents(el); }
        return { ok: o.selected, reason: 'The option did not stay selected' };
      }
      const s = limit === 'min' ? 'first' : limit === 'max' ? 'last' : strategy;
      const hints = key ? getSelectHints(key, dataset) : null;
      return type === 'radio'
        ? { ok: setRadioGroup(group || [el], hints, s), reason: 'The option did not stay selected' }
        : { ok: setSelect(el, hints, s), reason: 'The option did not stay selected' };
    }

    const isDateType = type === 'date' || type === 'datetime-local' || type === 'month';

    if (limit) {
      const b = boundaryValue(el, key, limit);
      if (b.skip) return { ok: null, reason: b.skip };
      // (Text values go through the same typing retry as normal values, so input masks
      // that ignore a pasted value still receive the boundary value.)
      const ok = isDateType ? setDate(el, b.value) : await setTextWithRetry(el, b.value);
      return { ok, reason: REJECTED };
    }

    // Edge cases in a box that only takes one kind of value (a date, a time, a number, a
    // colour): the payload ("<script>…", 5000 × "A") cannot be typed there, so the most
    // extreme value of that kind is used instead — and the log says so.
    const EDGE_NATIVE = { date: '9999-12-31', 'datetime-local': '9999-12-31T23:59', month: '9999-12', week: '9999-W52', time: '23:59', number: '99999999999999999999', color: '#000000' };
    // (An edge value that already fits — the "boundary" set's 1900-01-01 or 0 — is used as is.)
    const edgeFits = () => {
      const v0 = String(pickValueForField(el, key, dataset, mode) ?? '');
      if (type === 'number' || type === 'range') return v0.trim() !== '' && Number.isFinite(Number(v0));
      if (type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(v0);
      if (type === 'month') return isRealDate(v0 + '-01');
      if (type === 'week') return false; // (a week box's own value is always this week)
      if (isDateType) return isRealDate(v0.slice(0, 10));
      return false;
    };
    if (mode === 'edge' && (EDGE_NATIVE[type] || type === 'range') && !edgeFits()) {
      const v = type === 'range' ? String(el.max || 100) : EDGE_NATIVE[type];
      const ok = isDateType || type === 'week' || type === 'time' ? setDate(el, v) : setText(el, v);
      return { ok, reason: REJECTED, note: `A ${type === 'datetime-local' ? 'date-time' : type} box only takes a ${type === 'datetime-local' ? 'date and time' : type} — used the most extreme one` };
    }

    if (isDateType) {
      let v = pickValueForField(el, key, dataset, mode);
      if (v == null || v === '') return { ok: null, reason: 'No date to enter' };
      // A date picker cannot hold a malformed date ("99/99/9999"), so invalid mode uses
      // an impossible-but-real date instead: future birth, expired coverage, past visit.
      const asDay = type === 'month' ? `${v}-01` : String(v).slice(0, 10);
      if (mode === 'invalid' && !isRealDate(asDay)) {
        const iso = { terminationDate: '2000-01-01', appointmentDate: '2000-01-01', dateOfService: '2099-12-31' }[key] || '2099-12-31';
        v = type === 'month' ? iso.slice(0, 7) : type === 'datetime-local' ? iso + 'T12:00' : iso;
      }
      return { ok: setDate(el, String(v)), reason: `${REJECTED} (date inputs accept only real dates)` };
    }

    // Phone fields. type=tel alone is not enough — sites use it for ZIP / SSN / codes to
    // get a numeric keypad, so a tel input with a non-phone key is filled as that key.
    const isPhone = PHONE_KEYS.includes(key) ||
      (!key && (type === 'tel' || isInsidePhoneWidget(el)));
    if (isPhone) {
      return { ok: await fillPhone(el, PHONE_KEYS.includes(key) ? key : 'phone', dataset, mode, mode === 'invalid' && opts.invalidType === 'length'), reason: REJECTED };
    }

    // ---- Text-like fields ----
    let value = pickValueForField(el, key, dataset, mode);
    if (value == null || value === '') {
      // Classified field whose value is intentionally empty (optional suffix, the
      // "missing value" invalid case…) → leave it empty.
      if (key && dataset[key] != null) return { ok: null, reason: 'Left empty on purpose' };
      // Unrecognised field → label-based value (never the patient's full name, which
      // used to contaminate every unknown field, e.g. Address Line 2).
      value = smartValueForLabel(el, dataset, mode);
      // (Then what the field's own words and rules say it holds — never a stand-in "Test input".)
      if (value == null || value === '') value = mode === 'valid' ? (valueFromFieldWords(el, dataset) || 'Sample text') : genericValue(dataset);
      if (value == null || value === '') return { ok: null, reason: 'No value for this field' };
    }
    // Note: whitespace-only values ARE filled — that is the "Just spaces" edge case.

    // A number input can only hold numbers ("abc" is refused by the browser), so the
    // useful invalid value there is an out-of-range one.
    if (type === 'number' && mode === 'invalid' && !Number.isFinite(Number(value))) {
      const step = Number(el.step) > 0 ? Number(el.step) : 1;
      if (el.max !== '' && Number.isFinite(Number(el.max))) value = String(Number(el.max) + step);
      else if (el.min !== '' && Number.isFinite(Number(el.min))) value = String(Number(el.min) - step);
      else value = '-1';
    }

    if (mode !== 'edge' && el.maxLength > 0 && String(value).length > el.maxLength) {
      // Invalid mode keeps the oversize value 40% of the time to exercise length checks —
      // always with "Too short / too long", whose point is a value that is too long.
      if (!(mode === 'invalid' && (opts.invalidType === 'length' || Math.random() < 0.4))) {
        // Notes / comments are cut at a sentence end, not mid-word.
        const prose = el.tagName === 'TEXTAREA' || ['comment', 'notes', 'bio'].includes(key);
        value = prose ? cutText(value, el.maxLength) : String(value).slice(0, el.maxLength);
      }
    }

    let ok = await setTextWithRetry(el, String(value));
    // Email / URL boxes drop the spaces around a value (a browser rule): said, instead of a
    // failure ("Just spaces") or a "Leading / trailing spaces" value that silently lost them.
    const sv = String(value);
    let spacesNote;
    if (sv !== sv.trim() && ['email', 'url'].includes(type)) {
      if (!sv.trim()) return { ok: null, reason: 'This box removes spaces (a browser rule), so it stays empty' };
      if (ok && el.value === sv.trim()) spacesNote = 'The box removed the spaces around the value (browsers do this in email / URL boxes)';
    }
    if (isDatePickerWidget(el)) {
      // A date picker decides once it closes: the date must still be there then.
      const kept = async () => {
        await commitDatePicker(el);
        await sleep(150);
        return el.value.trim() !== '' && el.getAttribute('aria-invalid') !== 'true' && !el.closest('.ant-picker-status-error, .Mui-error, .is-invalid');
      };
      if (ok) ok = await kept();
      // Not taken in the format it shows (or it shows none): the other common formats —
      // and date + time for a date-time picker.
      if (!ok && mode === 'valid' && (DATE_KEYS.includes(key) || key === 'appointmentTime')) {
        for (const alt of pickerCandidates(key, dataset, String(value))) {
          if (await setTextWithRetry(el, alt) && await kept()) { ok = true; value = alt; break; }
        }
      }
    }
    if (ok && isTagInput(el)) {
      // Chips / tags are added with Enter. (A dispatched Enter never submits a form —
      // the browser only does that for real key presses.)
      pressKey(el, 'Enter');
      await sleep(80);
      return { ok: true, tag: String(value) };
    }
    if (ok && isAutocompleteInput(el)) await commitAutocomplete(el, String(value));
    return { ok, reason: REJECTED, note: spacesNote };
  }

  // A free-text tag box ("Type and press Enter", "Add a tag").
  function isTagInput(el) {
    if (el.tagName !== 'INPUT' || !['text', 'search', ''].includes((el.type || '').toLowerCase())) return false;
    const t = ((el.placeholder || '') + ' ' + getLabelText(el)).toLowerCase();
    return /press\s+enter|enter\s+to\s+add|type\s+and\s+press|add\s+(a\s+)?tags?|\btags?\b|\bchips?\b/.test(t);
  }

  function pressKey(el, key) {
    const code = key === 'Enter' ? 13 : 0;
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true }));
    }
  }

  // Transfer list: pick one or two entries in the neighbouring list and press its
  // "Add →" button. True when the target list received something (frameworks draw it on
  // their next render, so it is waited for).
  async function fillTransferList(target) {
    let box = target.parentElement;
    const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING;
    for (let i = 0; i < 3 && box && box !== document.body; i++, box = box.parentElement) {
      const src = Array.from(box.querySelectorAll('select[multiple]')).find((x) => x !== target && Array.from(x.options).some((o) => !o.disabled));
      if (!src) continue;
      const between = (b) => (src.compareDocumentPosition(b) & FOLLOWS && b.compareDocumentPosition(target) & FOLLOWS) ||
        (target.compareDocumentPosition(b) & FOLLOWS && b.compareDocumentPosition(src) & FOLLOWS);
      const btn = Array.from(box.querySelectorAll('button, [role="button"]')).find((b) => {
        const text = (b.textContent || '').trim();
        const named = [text, b.getAttribute('aria-label') || '', b.getAttribute('title') || ''].join(' ');
        const ctl = (b.getAttribute('aria-controls') || '').split(/\s+/);
        const tied = between(b) || (target.id && ctl.includes(target.id)) || (src.id && ctl.includes(src.id));
        const moves = /^(>|>>|→|⇒|»|›|≫|>\|)$/.test(text) || /\b(add|move\s*(right|over|to|selected|all)|include|assign)\b/i.test(named);
        return tied && moves && !/remove|←|<<|‹|«|\bback\b|\bleft\b|\bprev/i.test(named) && !forbiddenTarget(b);
      });
      if (!btn) continue;
      const pickable = Array.from(src.options).filter((o) => !o.disabled);
      const picks = shuffleCopy(pickable).slice(0, Math.min(2, pickable.length));
      Array.from(src.options).forEach((o) => { o.selected = picks.includes(o); });
      src.dispatchEvent(new Event('change', { bubbles: true }));
      btn.click();
      return !!(await waitUntil(() => target.options.length > 0, 1000));
    }
    return false;
  }
  const shuffleCopy = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  // A text box that shows suggestions as you type (ARIA combobox / autocomplete).
  function isAutocompleteInput(el) {
    const ac = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
    return el.getAttribute('role') === 'combobox' || ac === 'list' || ac === 'both';
  }

  // After typing into an autocomplete, choose the suggestion that matches what was typed
  // (as a user would — many apps only accept a chosen suggestion), then close the list.
  // If no suggestion comes, the typed text is left as it is (free text).
  async function commitAutocomplete(el, typed) {
    const own = () => {
      const list = controlledPopup(el);
      return list ? Array.from(list.querySelectorAll('[role="option"], li, [class*="option" i]')).filter((o) => isVisible(o) && (o.textContent || '').trim()) : [];
    };
    const t0 = performance.now();
    let options = own();
    while (!options.length && performance.now() - t0 < 3000 && (performance.now() - t0 < 700 || isLoadingShown(el))) {
      await sleep(100);
      options = own();
    }
    if (!options.length) return;
    const real = () => own().filter((o) => isRealOption(o) && !/no\s+(results?|matches|options)|nothing\s+found/i.test(o.textContent || ''));
    let hit = findByHints(real(), [typed], (o) => [o.textContent || '']) ||
      real().find((o) => (o.textContent || '').toLowerCase().includes(typed.toLowerCase().slice(0, 4)));
    // A lookup (address / provider search) that knows nothing like our value: search the
    // way a person would — a few letters — and take one of its own suggestions.
    if (!hit && !real().length && el.getAttribute('aria-autocomplete') === 'list') {
      // (The first word, at most 12 characters: an Edge "Very long string" is one 5,000-letter
      // word, and typing it key by key took over two minutes.)
      for (const seed of [typed.split(/\s+/)[0].slice(0, 12), 'a', 'e', '1']) {
        if (userStopped()) break;
        await typeSlowly(el, seed, 25, { blur: false });
        await waitUntil(() => real().length > 0, 1500);
        if (real().length) { hit = real()[0]; break; }
      }
      // Still nothing: the value that was typed stays (free text), not the last search letters.
      if (!hit && el.value !== typed) await setTextWithRetry(el, typed);
    }
    if (hit) {
      await clickOption(hit, () => !own().length);
    }
    await closeDropdown(el);
  }

  async function fillFormInner({ mode, options, edgeType, invalidType, dataset, files, target, fieldRules: fieldRulesIn }) {
    const opts = Object.assign(
      { highlight: true, onlyRequired: false, skipFilled: true, customDropdowns: true, expandSections: true, attachFiles: false, dropdownStrategy: 'match' },
      options || {},
      { edgeType: edgeType || 'random', invalidType: invalidType || 'random' }
    );
    if (!['valid', 'invalid', 'edge'].includes(mode)) mode = 'valid';
    keyUses = new Map();
    keyUseOf = new WeakMap();
    openTargetByKind = new Map();
    formPasswords = new Map();
    touchedFields = new Set();
    listsLeftOpen = new Set();
    closeTrace = new Map();
    ssnOtherForm = new WeakSet();
    const dialog = scopeToOpenDialog();
    // Your field settings for this site (none: nothing changes).
    prepareRules(fieldRulesIn);
    // Right-click → "Fill this field" / "Fill this section": that part of the page only.
    ruleTarget = null;
    if (target === 'field' || target === 'section') {
      const f = rightClickedField();
      if (!f) return { filled: 0, skipped: 0, failed: 0, total: 0, log: [], dialog, targetMissing: true };
      ruleTarget = f.el;
      fillScope = target === 'field' ? (f.el.type === 'radio' ? (f.el.closest('fieldset, [role="radiogroup"]') || f.el.parentElement || f.el) : f.el) : sectionOf(f.el);
    }
    try { noteEmptyForms(collectFields({ onlyRequired: false })); } catch (_) { emptyAtStart = null; }
    // Lists / dropdowns already open before the fill are not ours to close.
    const popupsAtStart = new Set(shownPopups());
    const expandedAtStart = new Set(document.querySelectorAll(EXPANDED_LIST_SEL));

    // The runner passes one dataset shared by all frames; generate one only if absent.
    if (dataset) { /* use it */ }
    else if (mode === 'invalid') dataset = window.QAData.generateInvalid(invalidType || 'random');
    else if (mode === 'edge') dataset = window.QAData.generateEdge(/^limit-/.test(opts.edgeType) ? 'random' : opts.edgeType);
    else dataset = window.QAData.generateValid();

    resetRegistry();
    const log = [];
    let filled = 0;
    let skipped = 0;
    let failed = 0;
    // When FillCraft last changed a field / a text field. The checks that let the page react
    // ("resets happen right after the change", "validates after a short debounce") wait that
    // long after the LAST change — not that long again when it has already passed.
    let lastChangeAt = 0;
    let lastTextFillAt = 0;
    const waitSinceChange = (ms, since) => sleep(Math.max(0, ms - (performance.now() - since)));
    const record = (el, group, key, status, reason, custom, labelOverride, valueOverride) => {
      // "Filled", but the field is empty now: the page cleared it again → not filled.
      if (status === 'filled' && !custom && typeof el.value === 'string' && el.value === '' &&
          !['checkbox', 'radio'].includes(el.type) && el.tagName !== 'SELECT') {
        status = 'failed';
        reason = 'The page cleared the value right after it was entered';
      }
      if (status === 'filled') { filled++; lastChangeAt = performance.now(); }
      else if (status === 'failed') failed++;
      else skipped++;
      // Describing the field must never abort the fill, so each part is guarded.
      const safe = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };
      if (el.type === 'checkbox') key = 'checkbox';
      log.push({
        idx: register(el),
        label: labelOverride || safe(() => fieldLabel(el, group, custom), `(${el.tagName.toLowerCase()})`),
        key: key || null,
        status,
        value: valueOverride != null ? valueOverride
          : (el.type || '').toLowerCase() === 'password' && status !== 'filled' ? maskedValue(el)
          : el.type === 'checkbox' && status === 'filled' && !el.checked ? 'Left unchecked'
          : safe(() => displayValue(el, group, custom), '—'),
        reason: status === 'filled' ? '' : reason || '',
        sig: safe(() => describeElement(el), ''),
        // The label is page text near the field (a table's previous cell, which can be a
        // patient's name), not a label of its own: the copied report leaves it out.
        ctxLabel: !labelOverride && safe(() => labelFromContext(el), false),
        // (Filled or left alone by your setting for this site — or a setting that fits two fields.)
        ...(fieldRules.length ? safe(() => ruleFlags(el), {}) : {}),
      });
    };

    // ---- Multi-pass fill ----
    // Filling one field can enable or reveal others (City after State, "If Other, please
    // specify" after choosing Other, a section after a Yes). So the form is re-scanned
    // after each pass and anything new — or anything that was disabled and is now
    // enabled — is filled, until a pass makes no progress (at most MAX_PASSES).
    const MAX_PASSES = 3;
    const limit = mode === 'edge' && /^limit-/.test(opts.edgeType) ? opts.edgeType.slice(6) : null;
    const isCountryKey = (k) => k === 'country' || k === 'countryCode';

    // What has been handled, by element and — because frameworks may re-render a field as
    // a new element — by a stable signature (tag + type + name/id), when it has one.
    const handledEls = new WeakSet();
    const handledSigs = new Map(); // signature → the element handled under it
    const sigOf = (el) => (el.name || el.id ? [el.tagName, el.type || '', el.name || '', el.id || ''].join('|') : null);
    // Same signature only counts when the old element is gone (the page re-rendered it).
    // Another live field with the same name (e.g. "firstName" in a Subscriber section
    // that opened later) is a different field and still gets filled.
    const seen = (el) => {
      if (handledEls.has(el)) return true;
      const prev = sigOf(el) && handledSigs.get(sigOf(el));
      if (!prev || prev === el || prev.isConnected) return false;
      // The page re-drew the field: already handled if the new copy kept a value (for a radio
      // group: a choice; a checkbox's either state may be the one chosen).
      if (el.type === 'radio') return radioGroupOf(el).some((r) => r.checked);
      return !(typeof el.value === 'string' && el.value === '' && el.type !== 'checkbox');
    };
    const markHandled = (els) => els.forEach((e) => { handledEls.add(e); const s = sigOf(e); if (s) handledSigs.set(s, e); });
    // The new copy of a field the page re-drew while it was filled: the one live field with the
    // same signature that is not handled yet (two candidates — a Subscriber section with the
    // same names — is not guessed). { el, group, kept } or null.
    const redrawnTwin = (el) => {
      const sig = sigOf(el);
      if (!sig) return null;
      const pool = el.type === 'radio'
        ? (el.name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(el.name)}"]`)) : [])
        : el.id ? [document.getElementById(el.id)] : el.name ? Array.from(document.getElementsByName(el.name)) : [];
      const fresh = pool.filter((x) => x && x !== el && x.isConnected && !handledEls.has(x) && x.tagName === el.tagName && (x.type || '') === (el.type || ''));
      if (el.type === 'radio') {
        if (!fresh.length || fresh.some((x) => x.form !== fresh[0].form)) return null;
        const group = radioGroupOf(fresh[0]);
        if (group.length !== fresh.length) return null;
        return { el: group[0], group, kept: group.some((r) => r.checked) };
      }
      const same = fresh.filter((x) => sigOf(x) === sig);
      if (same.length !== 1) return null;
      const t = same[0];
      return { el: t, group: null, kept: t.type === 'checkbox' ? t.checked === el.checked : typeof t.value === 'string' && t.value !== '' };
    };
    // No more work: the page went elsewhere, or the person pressed Stop.
    const halt = () => !!navigatedBy || userStopped();
    const deferred = new Map(); // disabled dropdowns waiting for another choice: control → info
    const uploadsDone = []; // uploads handled in this run: { ident, el } (see Pass F)
    const uploadAnchors = new WeakSet(); // their visible upload boxes
    const filledDropdowns = new Map(); // custom dropdowns filled in this run: control → key

    // Some dropdowns navigate ("Jump to section", "Switch patient"): if a choice takes the
    // page to another address, stop — the rest of the form is gone — and say which field
    // did it.
    let hrefNow = location.href;
    let navigatedBy = null;
    let lastFilledEl = null; // the most recent field filled: still on screen = same form
    const checkNavigation = (label, el) => {
      if (!navigatedBy && location.href !== hrefNow) {
        const anchor = [el, lastFilledEl].find((x) => x && x.isConnected && isPresent(x));
        const samePath = (() => { try { return new URL(hrefNow).pathname === location.pathname; } catch (_) { return false; } })();
        // Same page and the form is still there: the address only records state.
        if (samePath && anchor) hrefNow = location.href;
        else navigatedBy = { label: label || 'a field', to: location.pathname };
      }
      // The open dialog closed (some close when anything outside them is clicked): stop.
      if (!navigatedBy && fillScope && (!fillScope.isConnected || !isPresent(fillScope))) navigatedBy = { label: label || 'a field', closedDialog: true };
      return !!navigatedBy;
    };

    // Open collapsed form sections ("Subscriber Information ▾") so their fields get filled.
    const openedSections = opts.expandSections !== false ? await expandCollapsedSections() : [];

    const runPasses = async () => {
    for (let pass = 1; pass <= MAX_PASSES && !halt(); pass++) {
      // Before looking again, let fields revealed by the last pass (or by an opened
      // section) finish rendering.
      if (pass > 1) await waitForQuiet(300, 1500);
      refreshGuard();
      const filledBefore = filled;
      let work = 0;
      const lastPass = pass === MAX_PASSES;

      // -- Pass A: real form fields --
      const units = toUnits(collectFields({ onlyRequired: opts.onlyRequired, skipWidgetSelects: opts.customDropdowns !== false }))
        .filter(({ el, group }) => !(group || [el]).some(seen));
      const toCheck = []; // text fields filled in this pass: checked for page errors below
      for (const { el, group } of units) {
        if (halt()) break;
        if (!el.isConnected) continue; // the page re-drew the form: found again next pass
        work++;
        markHandled(group || [el]);
        let key = null;
        try {
          key = classify(el);
          // (Your setting: leave this field alone on this site.)
          if (key === LEAVE) { record(el, group, null, 'skipped', 'Left alone — your setting for this site'); continue; }
          if (opts.skipFilled && hasValue(el, key)) { record(el, group, key, 'skipped', 'Already filled'); continue; }
          if (el.tagName === 'SELECT' && isNavigationSelect(el)) { record(el, group, key, 'skipped', 'It changes the page (goes to another page or section), so it was left alone'); continue; }
          const textLike = !group && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'range', 'color'].includes((el.type || '').toLowerCase())));
          const errBefore = textLike ? errorSnapshot(el) : null;
          const r = await fillOne(el, group, key, mode, dataset, opts);
          const twin = r.ok === true && !el.isConnected ? redrawnTwin(el) : null;
          if (twin && twin.kept) {
            // The page re-drew the field while it was filled and the new copy holds the value:
            // that copy is this field, filled (otherwise it would vanish from the results).
            markHandled(twin.group || [twin.el]);
            record(twin.el, twin.group, key, 'filled', '', !!r.tag, null, r.tag);
            if (r.note) log[log.length - 1].note = r.note;
            lastFilledEl = twin.el;
          } else if (r.ok === true && !el.isConnected) {
            // The page re-drew the form while this was filled: the new copy is filled on
            // the next pass (it is not "seen" while it is empty).
            handledEls.delete(el);
          } else if (r.ok === true) {
            if (opts.highlight) (group || [el]).forEach((g) => flashHighlight(g, mode));
            record(el, group, key, 'filled', '', !!r.tag, null, r.tag);
            if (r.note) log[log.length - 1].note = r.note;
            lastFilledEl = el;
            // (Not one that record() already counted as failed: the page emptied it.)
            if (textLike && !r.tag && log[log.length - 1].status === 'filled') { toCheck.push({ el, key, entry: log[log.length - 1], before: errBefore }); lastTextFillAt = performance.now(); }
          } else {
            record(el, group, key, r.ok === false ? 'failed' : 'skipped', r.reason);
          }
        } catch (err) {
          record(el, group, key, 'failed', 'Error: ' + (err && err.message));
          console.warn('[FillCraft] Error filling field:', el, err);
        }
        if (checkNavigation(fieldLabelSafe(el, group), el)) break;
      }

      // -- Page errors on what was just filled --
      // Valid data: a field the page flags gets a value that follows the page's own
      // message ("between 0 and 99" → 3); if nothing satisfies it, it is emptied and
      // reported with the page's words. Invalid / edge data: errors are the point — the
      // message is only recorded.
      if (toCheck.length && !userStopped()) {
        await waitSinceChange(250, lastTextFillAt); // many forms validate on blur / after a short debounce
        for (const c of toCheck) {
          if (halt()) break;
          const err = fieldError(c.el, c.before);
          if (!err) continue;
          const said = err.message ? `"${tidy(err.message, 90)}"` : 'the field is marked invalid';
          // (Added to a note the fill already made, e.g. "the box removed the spaces".)
          if (mode !== 'valid') { c.entry.note = [c.entry.note, `Page showed: ${said}`].filter(Boolean).join(' · '); continue; }
          let fixed = false;
          for (const v of valuesForError(err.message, c.el, c.key, dataset).slice(0, 3)) {
            await setTextWithRetry(c.el, v);
            // (Some pages fade the old message out over a few hundred ms.)
            if (await waitUntil(() => !fieldError(c.el, c.before), 1000)) { fixed = true; break; }
          }
          if (fixed) {
            c.entry.value = displayValue(c.el, null, false);
            c.entry.note = `Adjusted — page said ${said}`;
            // A changed password: "Confirm password" (and friends) must say the same.
            if ((c.el.type || '').toLowerCase() === 'password') {
              formPasswords.set(passwordScope(c.el), c.el.value);
              for (const o of toCheck) {
                if (o === c || (o.el.type || '').toLowerCase() !== 'password' || o.el.value === c.el.value) continue;
                if ((c.el.form || document) !== (o.el.form || document)) continue;
                await setTextWithRetry(o.el, c.el.value);
                o.entry.value = displayValue(o.el, null, false);
                o.entry.note = 'Matched to the adjusted password';
              }
            }
          } else {
            await setTextWithRetry(c.el, '');
            c.entry.status = 'failed';
            c.entry.value = '—';
            c.entry.reason = `Page says: ${said}`;
            filled--; failed++;
          }
        }
      }

      // -- Checkbox groups ("Hobbies: Sports / Reading / Music") --
      // Valid data never leaves a whole group unticked — such groups usually require at
      // least one choice. (Single checkboxes and consent boxes are left as decided above.)
      if (mode === 'valid' && !halt()) {
        const done = new Set();
        const fillable = new Set(collectFields({ onlyRequired: false }));
        for (const { el } of units) {
          if (el.type !== 'checkbox' || done.has(el)) continue;
          const cgroup = checkboxGroupOf(el).filter((c) => fillable.has(c));
          cgroup.forEach((c) => done.add(c));
          if (cgroup.length < 2 || cgroup.some((c) => c.checked)) continue;
          // (Never a box that changes what the record is — "Deceased", "Do not call" — nor a
          // "None" / "Doesn't have …" box: the same rules as for a single box.)
          const pickable = cgroup.filter((c) => { if (c.disabled || !isFieldVisible(c) || isOneTimeCode(c)) return false; const k = checkboxKind(c); return !k.risky && !k.noneChoice; });
          const choice = pickable[Math.floor(Math.random() * pickable.length)];
          if (!choice) continue;
          choice.click();
          lastChangeAt = performance.now();
          const entry = log.find((e) => (window.__qaFormFillerEls || [])[e.idx] === choice);
          if (entry && choice.checked) entry.value = 'Checked';
        }
      }

      // -- Pass B: choice groups without real radio buttons (role="radio", toggle buttons) --
      for (const g of halt() ? [] : discoverChoiceGroups()) {
        if (halt()) break;
        if (seen(g.container) || (opts.onlyRequired && !g.required)) continue;
        work++;
        markHandled([g.container]);
        const key = resolveKey(g.label, [g.container.id, g.container.getAttribute('name'), g.container.getAttribute('formcontrolname'), g.container.getAttribute('data-testid')]);
        try {
          const current = g.options.find(isChoiceSelected);
          if (opts.skipFilled && current) {
            record(g.container, null, key, 'skipped', 'Already filled', true, g.label, choiceText(current));
            continue;
          }
          const r = await fillChoiceGroup(g, key, dataset, opts, limit);
          if (r.ok === true && opts.highlight) flashHighlight(g.container, mode);
          record(g.container, null, key, r.ok === true ? 'filled' : r.ok === false ? 'failed' : 'skipped', r.reason, true, g.label, r.value);
          if (checkNavigation(g.label, g.container)) break;
        } catch (err) {
          record(g.container, null, key, 'failed', 'Error: ' + (err && err.message), true, g.label, '—');
        }
      }

      // -- Pass C: custom dropdowns --
      if (opts.customDropdowns) {
        // Lists already on screen before any dropdown is opened (always-open listboxes).
        const staticOptions = new Set(findVisibleOptionsRaw());
        const allDropdowns = discoverCustomDropdowns();
        knownDropdowns = allDropdowns.map((d) => d.control);
        const dropdowns = allDropdowns
          .filter((d) => (!opts.onlyRequired || isDropdownRequired(d.control)) && !seen(d.control));
        for (const item of dropdowns) {
          if (halt()) break;
          if (!item.control.isConnected) continue; // removed by the page since discovery
          // A list FillCraft opened earlier that is open again (Tom Select re-opens one by itself
          // after a pick) is closed before the next dropdown opens.
          try { await closeLeftoverLists(popupsAtStart, expandedAtStart); } catch (_) { /* best effort */ }
          const key = item.key;
          // Named before filling: a "Select City" placeholder disappears once filled.
          let label0 = null;
          try { label0 = fieldLabel(item.control, null, true); } catch (_) { /* fall back later */ }
          // (Your setting: leave this dropdown alone on this site.)
          if (key === LEAVE) { work++; markHandled([item.control]); record(item.control, null, null, 'skipped', 'Left alone — your setting for this site', true, label0); continue; }
          try {
            if (opts.skipFilled && isCustomDropdownFilled(item.control)) {
              work++;
              markHandled([item.control]);
              record(item.control, null, key, 'skipped', 'Already filled', true, label0);
              continue;
            }
            if (limit === 'under' || limit === 'over') {
              work++;
              markHandled([item.control]);
              record(item.control, null, key, 'skipped', 'A choice list has nothing outside its options', true, label0);
              continue;
            }
            // Disabled until another choice is made: try again in the next pass.
            if (isDisabledDropdown(item.control) && !lastPass) {
              deferred.set(item.control, { key, label0 });
              continue;
            }
            work++;
            markHandled([item.control]);
            deferred.delete(item.control);
            // Valid data with nothing for it (a suffix most people do not have): never a random one.
            if (mode === 'valid' && !limit && key && dataset[key] === '') {
              record(item.control, null, key, 'skipped', 'Left empty on purpose (this person has none)', true, label0);
              continue;
            }
            const strategy = limit === 'min' ? 'first' : limit === 'max' ? 'last' : opts.dropdownStrategy;
            const hints = key ? getSelectHints(key, dataset) : [];
            const r = await fillCustomDropdown(item.control, hints, mode, { ...opts, dropdownStrategy: strategy, fieldKey: key, staticOptions });
            if (r === true) { record(item.control, null, key, 'filled', '', true, label0); filledDropdowns.set(item.control, key); }
            // Stop was pressed while this one was being searched: left, not failed.
            else if (userStopped()) record(item.control, null, key, 'skipped', USER_STOP_REASON, true, label0);
            // The page itself has disabled it (e.g. until another choice is made): not a failure.
            else if (r === 'Disabled on the page' || isEmptyListReason(r)) record(item.control, null, key, 'skipped', r, true, label0);
            else {
              record(item.control, null, key, 'failed', typeof r === 'string' ? r : 'Could not select an option', true, label0);
              // What it saw and did (structure only), for the copied troubleshooting report.
              if (lastDropdownDiag) log[log.length - 1].diag = lastDropdownDiag;
            }
            if (checkNavigation(label0, item.control)) break;
            // After picking a country, give the state dropdown a moment to load its options.
            if (isCountryKey(key)) await sleep(300);
          } catch (err) {
            record(item.control, null, key, 'failed', 'Error: ' + (err && err.message), true, label0);
            console.warn('[FillCraft] Error filling custom dropdown:', item.control, err);
          }
        }
      }

      // -- Pass D: widgets that are not form controls: editable text boxes (rich text,
      // contenteditable, role=textbox), ARIA sliders / spin buttons, read-only calendars --
      if (!halt() && !opts.onlyRequired) {
        for (const w of collectSpecialWidgets()) {
          if (halt()) break;
          if (seen(w.el)) continue;
          work++;
          markHandled([w.el]);
          try {
            if (opts.skipFilled && w.hasValue()) { record(w.el, null, w.key, 'skipped', 'Already filled', true, w.label, w.display()); continue; }
            const r = await w.fill(mode, dataset, opts);
            if (r.ok === true) {
              if (opts.highlight) flashHighlight(w.el, mode);
              record(w.el, null, w.key, 'filled', '', true, w.label, w.display());
            } else {
              record(w.el, null, w.key, r.ok === false ? 'failed' : 'skipped', r.reason, true, w.label, w.display());
            }
          } catch (err) {
            record(w.el, null, w.key, 'failed', 'Error: ' + (err && err.message), true, w.label);
          }
          if (checkNavigation(w.label, w.el)) break;
        }
      }

      // -- Pass F: file uploads — sample files (Settings → "Attach sample files"), valid data only --
      if (!halt() && files && opts.attachFiles && mode === 'valid') {
        for (const el of collectFileInputs()) {
          if (halt()) break;
          if (seen(el)) continue;
          if (opts.onlyRequired && !isRequired(el)) continue;
          const label = fileInputLabel(el);
          // A page that replaces its file box after a pick (jQuery File Upload, a React uploader
          // re-keyed) shows an empty new one: that upload already got its file — attaching again
          // would upload the document again on every pass.
          const ident = [label, el.accept || '', el.name || el.id || ''].join('|');
          const anchor = fileAnchor(el);
          if ((anchor && uploadAnchors.has(anchor)) || uploadsDone.some((u) => u.ident === ident && !u.el.isConnected)) { markHandled([el]); continue; }
          work++;
          markHandled([el]);
          uploadsDone.push({ ident, el });
          if (anchor) uploadAnchors.add(anchor);
          try {
            if (opts.skipFilled && el.files && el.files.length) { record(el, null, 'file', 'skipped', 'Already has a file', true, label, fileNames(el)); continue; }
            const r = await attachSampleFile(el, label, files);
            if (r.ok && opts.highlight) flashHighlight(fileAnchor(el) || el, mode);
            record(el, null, 'file', r.ok ? 'filled' : r.ok === null ? 'skipped' : 'failed', r.reason || '', true, label, r.value);
          } catch (err) {
            record(el, null, 'file', 'failed', 'Error: ' + (err && err.message), true, label);
          }
          if (checkNavigation(label, el)) break;
        }
      }

      // Stop when this pass filled nothing new (nothing it did can have enabled or
      // revealed anything) or there was nothing left to do.
      if (halt() || !work || filled === filledBefore) break;
      await sleep(150); // let the page render what the choices just enabled / revealed
    }
    };
    await runPasses();

    // Forms that allow one open section at a time close the others as each opens: open
    // each section the page closed again, on its own, and fill it.
    for (const t of openedSections) {
      if (halt()) break;
      if (!t.isConnected || t.getAttribute('aria-expanded') !== 'false' || !isSectionToggle(t)) continue;
      t.click();
      await waitForSectionsOpen([t]);
      await runPasses();
    }

    // Tabs inside the form ("Portal | Mail"): each other tab is opened and filled, then
    // the tab that was selected is selected again. (Site navigation is never touched.)
    if (opts.expandSections !== false && !halt()) {
      for (const list of document.querySelectorAll('[role="tablist"]')) {
        if (halt()) break;
        if (!isShown(list) || isInNavRegion(list) || !inFillScope(list)) continue;
        const tabs = Array.from(list.querySelectorAll('[role="tab"]')).filter((t) =>
          isShown(t) && !t.disabled && t.getAttribute('aria-disabled') !== 'true' && !isNavigatingAnchor(t));
        if (tabs.length < 2 || tabs.length > 12) continue;
        const original = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
        for (const t of tabs) {
          if (halt() || t.getAttribute('aria-selected') === 'true') continue;
          t.click();
          await waitForSectionsOpen([t]);
          if (checkNavigation(tidy((t.textContent || '').trim(), 30) + ' tab', t)) break;
          await runPasses();
        }
        if (!navigatedBy && original && original.isConnected && original.getAttribute('aria-selected') !== 'true') {
          original.click();
          await sleep(150);
        }
      }
    }

    // Text fields the page emptied AFTER they were filled — e.g. choosing "Relationship to
    // insured" resets the subscriber section — are filled once more (after the page
    // settles), or reported.
    if (!halt()) {
      await waitSinceChange(300, lastChangeAt); // resets happen right after the change that causes them
      const els = window.__qaFormFillerEls || [];
      // Custom dropdowns first, in fill order (Country before State) — a choice made again can
      // empty a text field that depends on it (the ZIP after a Country).
      if (filledDropdowns.size) {
        const staticOptions = new Set(findVisibleOptionsRaw());
        const ddStrategy = limit === 'min' ? 'first' : limit === 'max' ? 'last' : opts.dropdownStrategy;
        for (const e of log) {
          if (halt()) break;
          const el = els[e.idx];
          if (e.status !== 'filled' || !el || !filledDropdowns.has(el) || !el.isConnected || isCustomDropdownFilled(el)) continue;
          const key = filledDropdowns.get(el);
          let r = 'The page emptied this field after it was filled';
          lastDropdownDiag = null; // (a re-pick that does not run leaves no other dropdown's record)
          if (!isDisabledDropdown(el)) {
            try { r = await fillCustomDropdown(el, key ? getSelectHints(key, dataset) : [], mode, { ...opts, skipFilled: false, dropdownStrategy: ddStrategy, fieldKey: key, staticOptions }); } catch (err) { r = 'Error: ' + (err && err.message); }
            lastChangeAt = performance.now();
            // Still there a moment later? (Some pages empty a field again and again.)
            if (r === true) { await sleep(400); if (!el.isConnected || !isCustomDropdownFilled(el)) r = 'The page keeps emptying this field after it is filled'; }
          }
          if (r === true) {
            e.value = displayValue(el, null, true);
            e.note = 'Filled again — the page had emptied it';
          } else {
            e.status = 'failed';
            e.value = '—';
            e.reason = typeof r === 'string' ? r : 'The page emptied this field after it was filled';
            // (What the field holds now, structure only — and what the re-pick saw, if it ran.)
            e.diag = Object.assign({ fieldNow: structureOf(el, 3), emptiedAfterFill: true }, r === true || !lastDropdownDiag ? {} : { refill: lastDropdownDiag });
            filled--; failed++;
          }
          if (checkNavigation(e.label, el)) break;
        }
      }
      for (const e of log) {
        if (halt()) break;
        if (e.status !== 'filled') continue;
        const el = els[e.idx];
        if (!el || !el.isConnected || filledDropdowns.has(el) || !['INPUT', 'TEXTAREA'].includes(el.tagName)) continue;
        if (['checkbox', 'radio', 'file', 'range', 'color'].includes((el.type || '').toLowerCase())) continue;
        if (el.value !== '' || !isVisible(el) || isTagInput(el)) continue;
        if (e.key === 'ssn') ssnOtherForm.add(el); // (filled again in the other form: digits ↔ dashes)
        let ok = false;
        try { const r = await fillOne(el, null, e.key, mode, dataset, opts); ok = r.ok === true && el.value !== ''; } catch (_) { ok = false; }
        lastChangeAt = performance.now();
        // Still there a moment later? (Some pages empty a field again and again.)
        if (ok) { await sleep(600); ok = el.isConnected && el.value !== ''; if (!ok) e.reason = 'The page keeps emptying this field after it is filled'; }
        if (ok) {
          e.value = displayValue(el, null, false);
          e.note = 'Filled again — the page had emptied it';
        } else {
          const enteredLength = String(e.value == null ? '' : e.value).length;
          e.status = 'failed';
          e.value = '—';
          e.reason = e.reason || 'The page emptied this field after it was filled';
          e.diag = Object.assign({}, e.diag, { emptied: textFieldRules(el, enteredLength) });
          filled--; failed++;
        }
      }
    }

    // Dropdowns that stayed disabled through every pass (their dependency was not met).
    for (const [control, info] of deferred) {
      if (seen(control)) continue;
      record(control, null, info.key, 'skipped', userStopped() ? USER_STOP_REASON : 'Disabled on the page (it depends on another choice)', true, info.label0);
    }

    // With custom dropdowns turned off, count them (untouched) so the popup can say so.
    let customNotFilled = 0;
    if (!opts.customDropdowns) {
      try { customNotFilled = discoverCustomDropdowns().filter((d) => !isDisabledDropdown(d.control) && !isCustomDropdownFilled(d.control)).length; } catch (_) { /* informational only */ }
    }

    // Leave no list open.
    if (!navigatedBy) { try { await closeLeftoverLists(popupsAtStart, expandedAtStart); } catch (_) { /* never fail a fill over this */ } }
    // Lists FillCraft could not close (the popup says so) — each one's row says which, and what
    // was tried (structure only, for the copied report).
    const leftOpen = Array.from(listsLeftOpen).filter((d) => d.isConnected).length;
    try {
      const els = window.__qaFormFillerEls || [];
      for (const d of listsLeftOpen) {
        if (!d.isConnected) continue;
        const row = log.find((e) => els[e.idx] === d);
        if (!row) continue;
        row.note = [row.note, 'Its list stayed open — FillCraft could not close it'].filter(Boolean).join(' · ');
        row.diag = Object.assign({}, row.diag, { listLeftOpen: closeTrace.get(d) || {} });
      }
    } catch (_) { /* informational only */ }
    // A text field the page emptied again after FillCraft filled it (and re-filled it): empty at
    // the end is not "filled". (A moment first: some pages empty a field a little later.)
    if (!navigatedBy) {
      await waitSinceChange(300, lastChangeAt);
      const els = window.__qaFormFillerEls || [];
      for (const e of log) {
        const el = els[e.idx];
        if (e.status !== 'filled' || !el || !el.isConnected || filledDropdowns.has(el)) continue;
        if (!(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'hidden', 'button', 'submit', 'range', 'color'].includes((el.type || '').toLowerCase())))) continue;
        // (A tag / chip box empties itself once Enter added the chip: that is how it works.)
        if (el.value !== '' || isTagInput(el)) continue;
        const enteredLength = String(e.value == null ? '' : e.value).length;
        e.status = 'failed';
        e.reason = 'The page emptied this field again after it was filled' + (/Filled again/.test(e.note || '') ? ' (also after filling it again)' : '');
        e.value = '—';
        e.diag = Object.assign({}, e.diag, { emptied: textFieldRules(el, enteredLength), emptiedLate: true });
        filled--; failed++;
      }
    }

    // NOTE: This extension intentionally NEVER submits or closes the form. It only
    // fills fields.
    return { filled, skipped, failed, total: log.length, log, customNotFilled, navigatedBy, dialog, leftOpen, cancelled: userStopped() };
  }

  // A dropdown that moves the page rather than holding a value: its own change handler
  // submits the form or changes the address, or its label says it goes somewhere.
  function isNavigationSelect(el) {
    const handler = (el.getAttribute('onchange') || '') + ' ' + (el.getAttribute('onclick') || '');
    if (/submit\s*\(|location|href|navigate|window\.open|\.go\s*\(|__doPostBack/i.test(handler)) return true;
    const label = (getLabelText(el) || el.getAttribute('aria-label') || '').trim();
    return /^(go\s*to|jump\s*to|navigate|switch\s+(to\s+)?(patient|user|account|location|facility|organi[sz]ation|clinic|practice|company|workspace|site)|sort(\s+by)?|order\s+by|(rows|results|items|records|entries)\s+per\s+page|per\s+page|page\s+size|show\s+\d*\s*(rows|entries|results)|view\s+(as|by)|filter\s+by)\b/i.test(label);
  }
  const fieldLabelSafe = (el, group) => { try { return fieldLabel(el, group, false); } catch (_) { return 'a field'; } };

  // Other ways to write the field's date (after `tried` was refused): US, ISO and
  // day-first dates; for an appointment time, the time alone and date + time.
  function pickerCandidates(key, dataset, tried) {
    const out = [];
    const add = (v) => { if (v && v !== tried && !out.includes(v)) out.push(v); };
    const iso = toISODate(dataset[dateKeyFor(key === 'appointmentTime' ? 'appointmentDate' : key)] ?? dataset.today);
    if (!isRealDate(iso)) return out;
    const [y, m, d] = iso.split('-');
    const dates = [`${m}/${d}/${y}`, iso, `${d}/${m}/${y}`];
    if (key === 'appointmentTime') {
      const t24 = dataset.appointmentTime24 || '10:30';
      const t12 = dataset.appointmentTime || '10:30 AM';
      add(t12); add(t24);
      for (const dt of dates) { add(`${dt} ${t24}`); add(`${dt} ${t12}`); }
    } else dates.forEach(add);
    return out;
  }

  // A date picker's calendar opens when its box is focused, and some keep it open after a
  // plain blur (react-datepicker): close it the way a person does after typing a date —
  // Enter for flatpickr (which also reads the typed date then), Tab for the others.
  async function commitDatePicker(el) {
    const flat = el.classList.contains('flatpickr-input') && !el.readOnly;
    const key = flat ? 'Enter' : 'Tab';
    const code = flat ? 13 : 9;
    for (const type of ['keydown', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true }));
    }
    await sleep(40);
  }

  // A text input driven by a date-picker component (react-datepicker, MUI / Ant /
  // Vuetify pickers, flatpickr, bootstrap-datepicker…).
  function isDatePickerWidget(el) {
    if ((el.type || '') !== 'text' && (el.type || '') !== '') return false;
    return !!(el.closest('.react-datepicker-wrapper, .react-datepicker__input-container, [class*="datepicker" i], [class*="date-picker" i], [class*="DatePicker"], .MuiPickersInputBase-root, .ant-picker, .v-date-picker, .mat-datepicker-input') ||
      el.classList.contains('flatpickr-input') || el.getAttribute('data-provide') === 'datepicker' || el.hasAttribute('matDatepicker'));
  }

  // ---------- Clear ----------
  // Counts only fields that actually changed.
  function clearForm(payload = {}) {
    if (window.__qaFormFillerBusy) return { error: 'A fill is running on this page — clear it once the fill is done' };
    window.__qaFormFillerBusy = true;
    try { return clearFormInner(payload); } finally { window.__qaFormFillerBusy = false; }
  }
  function clearFormInner({ options } = {}) {
    const opts = options || {};
    const dialog = scopeToOpenDialog();
    const elements = collectFields({ onlyRequired: false });
    const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set;
    let cleared = 0;
    let failed = 0;
    let kept = 0;
    let alwaysSet = 0; // sliders and colour pickers: they always hold a value
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      let changed = false;
      // A code the person typed in themselves (a verification code) is theirs: left alone.
      if (isOneTimeCode(el)) continue;
      // A dropdown that moves the page ("Go to", "Sort by", "Switch patient"): left alone, as
      // a fill does — changing it would leave the page.
      if (tag === 'select' && isNavigationSelect(el)) continue;
      // A slider or colour picker cannot be empty (setting "" puts back its default): not a
      // failure — counted with the other fields Clear does not empty.
      if (type === 'range' || type === 'color') { alwaysSet++; continue; }
      try {
        if (type === 'checkbox' || type === 'radio') {
          if (el.checked) {
            // Clicking a checked RADIO does not uncheck it, so set the property directly.
            if (type === 'checkbox') el.click();
            if (el.checked) {
              checkedSetter.call(el, false);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            changed = !el.checked;
          }
        } else if (tag === 'select') {
          const before = Array.from(el.options).map((o) => o.selected).join();
          if (el.multiple) {
            Array.from(el.options).forEach((o) => { o.selected = false; });
          } else {
            // Back to the placeholder option if there is one, otherwise no selection.
            el.selectedIndex = Array.from(el.options)
              .findIndex((o) => o.value === '' || isPlaceholderText(o.textContent));
          }
          if (Array.from(el.options).map((o) => o.selected).join() !== before) {
            fireEvents(el);
            changed = true;
          }
        } else if (el.value !== '' && isDatePickerWidget(el)) {
          // Emptying a date-picker widget crashes some apps (their onChange cannot
          // handle "no date" — seen on a real React form: the page went blank). Leave
          // it; the popup says so.
          kept++;
        } else if (el.value !== '') {
          el.focus({ preventScroll: true });
          nativeSet(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          if (el.value !== '') {
            // Input masks often reject a programmatic empty value — clear it the way
            // a user would: select all + Backspace.
            try { el.select(); } catch {}
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true }));
            nativeSet(el, '');
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true }));
          }
          fireEvents(el);
          changed = el.value === '';
          if (!changed) failed++;
        }
        if (changed) {
          cleared++;
          if (opts.highlight) flashHighlight(el, 'clear');
        }
      } catch (err) {
        failed++;
        console.warn('[FillCraft] Error clearing field:', el, err);
      }
    }
    // Files attached to uploads.
    for (const el of collectFileInputs()) {
      if (!el.files || !el.files.length) continue;
      try {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (!el.files.length) cleared++;
      } catch (_) { failed++; }
    }
    // What Clear does not empty but still holds a value (custom dropdowns, choice buttons,
    // rich-text boxes, sliders, read-only calendar boxes): counted, so the popup can say so.
    let notCleared = alwaysSet;
    try {
      notCleared += discoverCustomDropdowns().filter((d) => isCustomDropdownFilled(d.control)).length;
      notCleared += discoverChoiceGroups().filter((g) => g.options.some(isChoiceSelected)).length;
      notCleared += collectSpecialWidgets().filter((w) => w.hasValue()).length;
    } catch (_) { /* informational only */ }
    return { filled: cleared, failed, kept, total: elements.length, dialog, notCleared };
  }

  // ---------- Detect (preview) ----------
  // Reports exactly what a fill with the same options would work on.
  function detect({ options, fieldRules: fieldRulesIn } = {}) {
    // Resetting the registry mid-fill would point the fill's log rows at wrong fields.
    if (window.__qaFormFillerBusy) return { error: 'A fill is already running on this page' };
    const opts = options || {};
    resetRegistry();
    const dialog = scopeToOpenDialog();
    ruleTarget = null;
    prepareRules(fieldRulesIn);
    const units = toUnits(collectFields({ onlyRequired: !!opts.onlyRequired, skipWidgetSelects: opts.customDropdowns !== false }));
    const summary = {};
    const log = [];
    const add = (el, group, key, fallback, custom) => {
      // (Left alone by your setting: listed as such.)
      if (key === LEAVE) { key = null; fallback = '?leave'; }
      const k = key || fallback;
      summary[k] = (summary[k] || 0) + 1;
      log.push({
        idx: register(el),
        label: fieldLabel(el, group, custom),
        key: key || null,
        kind: key ? '' : fallback,
        status: 'detected',
        value: (el.type || '').toLowerCase() === 'password' ? maskedValue(el) : displayValue(el, group, custom),
        required: custom ? isDropdownRequired(el) : isRequired(el),
        sig: describeElement(el),
        ...(fieldRules.length ? ruleFlags(el) : {}),
      });
    };
    for (const { el, group } of units) {
      // (A one-time code is never filled, so it is not listed either.)
      if (isOneTimeCode(el)) continue;
      add(el, group, el.type === 'checkbox' ? 'checkbox' : classify(el), `?${el.tagName.toLowerCase()}:${el.type || 'text'}`);
    }
    // Choice groups without real radio buttons (role="radio", toggle buttons).
    for (const g of discoverChoiceGroups()) {
      if (opts.onlyRequired && !g.required) continue;
      // (The same names a fill reads, so the preview names the same type.)
      const key = resolveKey(g.label, [g.container.id, g.container.getAttribute('name'), g.container.getAttribute('formcontrolname'), g.container.getAttribute('data-testid')]);
      const k = key || '?choice-group';
      summary[k] = (summary[k] || 0) + 1;
      const cur = g.options.find(isChoiceSelected);
      log.push({ idx: register(g.container), label: g.label, key: key || null, kind: key ? '' : '?choice-group',
        status: 'detected', value: cur ? choiceText(cur) : '—', required: g.required, sig: describeElement(g.container) });
    }
    let customCount = 0;
    if (opts.customDropdowns !== false) { // on unless turned off
      // Same discovery as a fill, so the preview matches what a fill will work on.
      for (const { control, key } of discoverCustomDropdowns().filter((d) => !opts.onlyRequired || isDropdownRequired(d.control))) {
        add(control, null, key, '?custom-dropdown', true);
        customCount++;
      }
    }
    // Editable text boxes, sliders and read-only calendars (filled in the fill's last pass).
    if (!opts.onlyRequired) {
      try {
        for (const w of collectSpecialWidgets()) {
          const k = w.key || '?widget';
          summary[k] = (summary[k] || 0) + 1;
          log.push({ idx: register(w.el), label: w.label, key: w.key || null, kind: w.key ? '' : '?widget', status: 'detected',
            value: w.display(), required: false, sig: describeElement(w.el) });
        }
      } catch (_) { /* informational only */ }
    }
    // Upload fields, when sample files are switched on (otherwise they are left alone).
    if (opts.attachFiles) {
      try {
        for (const el of collectFileInputs()) {
          if (opts.onlyRequired && !isRequired(el)) continue;
          summary.file = (summary.file || 0) + 1;
          log.push({ idx: register(el), label: fileInputLabel(el), key: 'file', kind: '', status: 'detected',
            value: el.files && el.files.length ? fileNames(el) : '—', required: isRequired(el), sig: describeElement(el) });
        }
      } catch (_) { /* informational only */ }
    }
    // With custom dropdowns off, still say how many there are (untouched).
    let customNotFilled = 0;
    if (opts.customDropdowns === false) {
      try { customNotFilled = discoverCustomDropdowns().filter((d) => !isDisabledDropdown(d.control)).length; } catch (_) { /* informational only */ }
    }
    return { total: log.length, summary, log, customNotFilled, dialog };
  }

  // ---------- Reveal (popup log row → field on the page) ----------
  function reveal({ idx } = {}) {
    const el = (window.__qaFormFillerEls || [])[idx];
    if (!el || !el.isConnected) return { error: 'That field is no longer on the page' };
    const shown = isPresent(el) || (typeof fileAnchor === 'function' && el.type === 'file' && fileAnchor(el) && isPresent(fileAnchor(el)));
    if (!shown) return { error: 'That field is hidden right now (in another tab or a closed section)' };
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashHighlight(el, 'reveal', 2500);
    return { filled: 0, total: 0 };
  }

  // ---------- File uploads (sample files) ----------
  // The visible thing that stands for a file input: the input itself, its <label for>,
  // the label around it, or a small visible wrapper (an "Upload" button / drop zone).
  function fileAnchor(el) {
    if (isShown(el)) return el;
    const lab = el.id && document.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (lab && isShown(lab)) return lab;
    const wrap = el.closest('label');
    if (wrap && isShown(wrap)) return wrap;
    let p = el.parentElement;
    for (let i = 0; i < 3 && p && p !== document.body; i++, p = p.parentElement) {
      if (!isShown(p)) continue;
      const t = (p.innerText || '').trim();
      if (t && t.length <= 160 && p.querySelectorAll('input[type="file"]').length === 1) return p;
    }
    return null;
  }

  function collectFileInputs() {
    const all = Array.from(document.querySelectorAll('input[type="file"]'));
    for (const root of shadowRoots()) all.push(...root.querySelectorAll('input[type="file"]'));
    return all.filter((el) => !el.disabled && inFillScope(el) && !isInNavRegion(el) && !el.closest('[aria-hidden="true"]') && fileAnchor(el));
  }

  // The heading that says what an upload is for: the nearest short text before it —
  // "Photo ID (drag and drop)" above a drop zone, "Medicare ID" at the start of a row of
  // "Upload Front / Back Picture" buttons. Blocks holding other fields are skipped.
  function fileHeading(a) {
    let n = a;
    for (let depth = 0; depth < 3 && n && n !== document.body; depth++, n = n.parentElement) {
      for (let p = n.previousElementSibling; p; p = p.previousElementSibling) {
        if (!p.matches('label') && p.querySelector('input, select, textarea')) continue;
        const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
        if (!t || !isShown(p)) continue;
        if (t.length <= 60) return t;
        break;
      }
    }
    return '';
  }

  const GENERIC_UPLOAD_TEXT = /^(drop|drag|click|browse|choose|select|upload|attach|add)\b|^(no file|file upload)/i;

  // What an upload is for: its own label, the text of its button / drop zone, and the
  // heading before it.
  function fileContext(el) {
    const a = fileAnchor(el);
    const own = getLabelText(el) || el.getAttribute('aria-label') || '';
    // The button / drop-zone words: the anchor's text, or — when the anchor is the <label> —
    // the small box holding this one upload ("Upload Back Picture" next to the label).
    let near = a && a !== el ? (a.innerText || '').replace(/\s+/g, ' ').trim() : '';
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 3; p = p.parentElement, i++) {
      if (p.querySelectorAll('input[type="file"]').length !== 1 || !isShown(p)) break;
      const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length > 160) break;
      if (t.length > near.length) near = t;
    }
    const heading = a ? fileHeading(a) : '';
    return { own, near: near.slice(0, 120), heading };
  }

  // An upload's name in the results list. (Display only — which sample file an upload gets is
  // decided from fileContext.) Its words come from its label or from a box around it that holds
  // no other field: a whole form row repeats the other fields' labels ("Enter Name Enter Name
  // Consent Date Consent Date Upload File Clear"). Filler is left out: "Click here to", "Drag
  // and Drop Your File", "or Browse", "Supported formats …".
  const UPLOAD_FILLER_RE = /\bsupported\s+formats?\b.*$|\bclick\s+(here\s+)?to\b|\b(drag\s*(and|&)\s*drop|drop)\s+(your\s+)?(files?|documents?|images?)?(\s+here)?|,?\s*\bor\s+browse(\s+files?)?\b/gi;
  const uploadWords = (t) => String(t || '').replace(UPLOAD_FILLER_RE, ' ').replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();
  function fileInputLabel(el) {
    const { own, heading } = fileContext(el);
    const othersIn = (box) => Array.from(box.querySelectorAll('input:not([type=hidden]), select, textarea')).some((f) => f !== el);
    let near = '';
    const a = fileAnchor(el);
    if (a && a !== el && !othersIn(a)) near = (a.innerText || '').replace(/\s+/g, ' ').trim();
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 3; p = p.parentElement, i++) {
      if (othersIn(p) || !isShown(p)) break;
      const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length > 120) break;
      if (t.length > near.length) near = t;
    }
    const ownWords = uploadWords(own);
    const nearWords = uploadWords(near);
    const specific = [ownWords, nearWords].find((t) => t && !GENERIC_UPLOAD_TEXT.test(t));
    // "Medicare ID — Upload Front Picture": the heading plus which button, when the
    // box's own words are generic.
    const text = specific || [uploadWords(heading), ownWords || nearWords].filter(Boolean).join(' — ');
    return tidy(text || 'File upload', 70);
  }

  const fileNames = (el) => Array.from(el.files || []).map((f) => f.name).join(', ') || '—';

  // ---------- Which sample file an upload gets (pure: text in, sample slots out) ----------
  // The upload's own words (label, button) decide first, then the heading before it, then
  // its name attribute. Specific kinds (Medicare card, signature, wound photo…) beat
  // generic words ("photo", "document", "upload") wherever they appear.
  const UPLOAD_STRONG = [
    // [kind, pattern] — first match wins within one piece of text
    ['signature', /\bsignature\b|sign\s*here|\be-?sign(ature)?\b|autograph|\bfirma\b/],
    ['document', /explanation\s+of\s+benefits|\beob\b|claim\s*(form|document)?s?\b|superbill|itemi[sz]ed|invoice|payment\s*receipt|receipt\s*of\s*payment|denial|appeal|prior\s*auth(ori[sz]ation)?\s*(letter|form)|coverage\s*(letter|determination)/],
    // Medicare Advantage / Part C / Part D / Medigap cards are private plan cards.
    ['insurance', /medicare\s*(advantage|replacement|supplement|part\s*[cd])|medigap|\bma\s*plan|\bmapd\b/],
    ['medicare', /medicare|\bmbi\b/],
    ['medicaid', /medicaid|\bmedi[\s-]cal\b|\bchip\b|masshealth|ahcccs|tenncare|soonercare/],
    ['insurance', /insurance|insured|member\s*(id\s*)?card|\bpayer|\bpayor|health\s*plan|benefits?\s*card|\bseguro\b|tarjeta\s*del?\s*(plan|seguro)|\b(rx|pharmacy|prescription(\s*drug)?|dental|vision|medical|health|plan|subscriber)[\s()\/,-]*(benefits?\s*)?(id\s*)?card|coverage\s*card/],
    ['document', /(nursing|medical|professional|business|practice|state\s*board|dea|board)\s*licen[cs]e|licen[cs]e\s*(certificate|verification)|certificate|certification|diploma|transcript/],
    ['photoId', /driver'?s?\s*licen[cs]e|driving\s*licen[cs]e|\blicen[cs]e\b|photo\s*id|picture\s*id|state\s*(issued\s*)?id|government(-|\s)*(issued\s*)?id|\bpassport\b|identification|proof\s*of\s*identity|\bid\b|green\s*card|permanent\s*resident|military\s*id|list\s*(a|b)\b|\bssn\s*card|social\s*security\s*card|identificaci[oó]n|licencia\s*de\s*(conducir|manejo)|pasaporte/],
    ['consent', /consent|hipaa|acknowledg|advance\s*directive|living\s*will|power\s*of\s*attorney|\bpoa\b|\bpolst\b|\bmolst\b|\bdnr\b|do\s*not\s*resuscitate|guardian(ship)?\s*(papers?|documents?|order|letters?)?|conservator|authori[sz]ation|release\s*of\s*(medical\s*)?information|\broi\b|agreement|contract|signed\s*(form|document|copy|page)|signature\s*page|attestation|waiver|consentimiento|autorizaci[oó]n/],
    ['document', /(x-?ray|imaging|mri|ct|ultrasound|radiology|scan|photo)\s*(report|result|summary|letter|order|requisition)/],
    ['clinical', /wound|\bskin\b|rash|lesion|\bmole\b|\bburn\b|injur|bruis|ulcer|pressure\s*(sore|injury)|bed\s*sore|incision|\bsite\b\s*(photo|picture)|x-?ray|radiograph|imaging|\bmri\b|ultrasound|affected\s*area|photo\s*of\s*(the\s*)?(area|symptom|condition|injury|problem)|dermatolog|intra-?oral|tooth|teeth|swelling|herida|erupci[oó]n|lesi[oó]n/],
    ['profile', /profile|avatar|headshot|head\s*shot|portrait|selfie|passport[\s-]*(size|style)|(patient|resident|member|employee|student|user|client|child|staff|applicant|caregiver|your|my|their)'?s?\s*(photo|picture|image|pic)|photo(graph)?\s*of\s*(you|yourself|the\s*(patient|resident|member|child|applicant))\b|\bface\b/],
    ['document', /record|report|result|\blabs?\b|referral|letter|summary|discharge|prescription|\brx\b|medication|immuni[sz]ation|vaccin|proof\s*of|utility|\bbill\b|bank|statement|pay\s*stub|\bw-?2\b|\btax|income|\blease\b|resume|\bcv\b|physical\s*(form|exam)|questionnaire|\bnotes?\b|history|chart|order|requisition|care\s*plan|assessment|progress|clearance|court|legal|\breceta\b|expediente/],
  ];
  const UPLOAD_WEAK = [
    ['insurance', /\bcard\b/],
    ['profile', /\bphoto|picture|image|\bpic\b|headshot|\bfoto/],
    ['document', /document|\bdocs?\b|documento|archivo|\bfiles?\b|attachment|attach|other|additional|supporting|misc|upload|pdf|scan/],
  ];
  const uploadKindIn = (text, rules) => {
    for (const [kind, re] of rules) if (re.test(text)) return kind;
    return null;
  };

  // parts: { label, button, heading, attrs } (lower-case). Returns the upload kind.
  function uploadKind(parts) {
    const order = [parts.label, parts.button, parts.heading, parts.attrs].filter(Boolean);
    for (const t of order) {
      // A bare "id" in a name attribute ("upload_id", "file_id") is not a photo ID.
      const k = uploadKindIn(t, t === parts.attrs ? UPLOAD_STRONG.map(([kd, re]) => (kd === 'photoId' ? [kd, /driver|licen[cs]e|photo\s*id|state\s*id|passport|identification|\bdl\b/] : [kd, re])) : UPLOAD_STRONG);
      if (k) return k;
    }
    for (const t of order) { const k = uploadKindIn(t, UPLOAD_WEAK); if (k) return k; }
    return 'unknown';
  }

  // Front / back from the upload's own words, else from its heading.
  function uploadSide(parts) {
    const own = `${parts.label} ${parts.button}`;
    // English and Spanish (frente / reverso / trasera / ambos lados); "F/B" = front and back.
    const read = (t) => ({
      front: /\bfront\b|obverse|\bfrente\b|\banverso\b|\bdelantera?\b/.test(t),
      back: /\bback\b|\breverse\b|\brear\b|\breverso\b|\btrasera?\b|\bdorso\b|parte\s+de\s+atr[aá]s/.test(t),
      both: /both\s+sides|front\s*(and|&|\/|\+)\s*back|back\s*(and|&|\/|\+)\s*front|\bf\s*\/\s*b\b|ambos\s+lados|frente\s*y\s*(reverso|dorso|atr[aá]s)/.test(t),
    });
    const o = read(own);
    if (o.both || o.front || o.back) return o.both || (o.front && o.back) ? 'both' : o.back ? 'back' : 'front';
    const h = read(`${parts.heading} ${parts.attrs}`);
    return h.both || (h.front && h.back) ? 'front' : h.back ? 'back' : 'front';
  }

  // What the upload accepts: can we give it a PDF, an image (we can make JPG / PNG / WEBP)?
  function uploadAccepts(accept) {
    const list = String(accept || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    if (!list.length || list.includes('*/*') || list.includes('*')) return { pdf: true, image: true };
    const pdf = list.some((a) => a === '.pdf' || a === 'application/pdf' || a === 'application/*');
    const image = list.some((a) => a === 'image/*' || /^(\.(jpe?g|png|webp)|image\/(jpe?g|pjpeg|png|webp))$/.test(a));
    return { pdf, image };
  }

  // The sample slot(s) for an upload, in the order to attach them. [] = nothing fits.
  function planUploadSlots(parts, accept, multiple) {
    const kind = uploadKind(parts);
    const side = uploadSide(parts);
    const can = uploadAccepts(accept);
    const card = (front, back) => {
      if (!can.image) return can.pdf ? ['record'] : [];
      if (side === 'both') return multiple ? [front, back] : [front];
      return [side === 'back' ? back : front];
    };
    switch (kind) {
      case 'signature': return can.image ? ['signature'] : [];
      case 'medicare': return card('medicare', 'medicareBack');
      case 'medicaid': return card('medicaid', 'medicaidBack');
      case 'insurance': return card('insuranceFront', 'insuranceBack');
      case 'photoId': return card('photoId', 'photoIdBack');
      case 'clinical': return can.image ? ['clinicalImage'] : [];
      case 'profile': return can.image ? ['avatar'] : [];
      case 'consent': return can.pdf ? ['consent'] : can.image ? ['documentImage'] : [];
      default: return can.pdf ? ['record'] : can.image ? ['documentImage'] : [];
    }
  }
  // ---------- End of upload matching ----------

  // Does the input's accept list allow this file?
  function acceptsFile(el, name, type) {
    const accept = (el.getAttribute('accept') || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
    if (!accept.length) return true;
    const ext = '.' + String(name).split('.').pop().toLowerCase();
    const alias = { '.jpg': ['.jpg', '.jpeg'], '.jpeg': ['.jpg', '.jpeg'] }[ext] || [ext];
    // ("image/jpg" and "image/pjpeg" are what many pages write for JPEG.)
    const mime = (t) => (/^image\/(jpg|pjpeg)$/.test(t) ? 'image/jpeg' : t);
    return accept.some((a) => (a.startsWith('.') ? alias.includes(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : mime(a) === mime(String(type).toLowerCase())));
  }

  // The size limit a page states near the upload ("max 5MB", "up to 500 KB"), in bytes.
  // Any wording works — "Max 2 MB", "Maximum file size: 30 KB", "Files up to 5MB",
  // "Size limit 500kb", "(10 MB max)": every size in the upload's own box counts when the
  // text speaks of a maximum / limit / size, and the smallest one is used.
  function statedSizeLimit(el, ctx) {
    let box = '';
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 4; p = p.parentElement, i++) {
      if (p.querySelectorAll('input[type="file"]').length !== 1) break;
      const t = p.innerText || '';
      if (t.length > 300) break;
      box = t;
    }
    const text = `${ctx} ${box}`.toLowerCase();
    if (!/max|limit|up\s*to|under|less\s*than|no\s*(larger|bigger|more)|size|≤|</.test(text)) return Infinity;
    const units = { kb: 1024, mb: 1048576, gb: 1073741824 };
    const sizes = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(kb|mb|gb)\b/g)).map((m) => Number(m[1]) * units[m[2]]);
    return sizes.length ? Math.min(...sizes) : Infinity;
  }

  function b64ToFile(s) {
    const bin = atob(s.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], s.name, { type: s.type, lastModified: Date.now() });
  }

  // Re-encode an image as another image type the input accepts (png / webp / jpeg).
  // A smaller copy of an image that fits under `limit` bytes (lower JPEG / WEBP quality,
  // then smaller dimensions), in a type the input accepts. null when it cannot be done.
  async function shrinkImage(file, limit, el) {
    if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return null;
    try {
      const bmp = await createImageBitmap(file);
      const candidates = ['image/jpeg', 'image/webp', 'image/png'].filter((t) => {
        const ext = { 'image/jpeg': 'x.jpg', 'image/webp': 'x.webp', 'image/png': 'x.png' }[t];
        return acceptsFile(el, ext, t);
      });
      for (const type of candidates) {
        for (const scale of [1, 0.8, 0.6, 0.45, 0.33, 0.25, 0.18, 0.12]) {
          for (const quality of type === 'image/png' ? [1] : [0.8, 0.6, 0.45]) {
            const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
            const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
            const g = canvas.getContext('2d');
            if (type === 'image/jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
            g.drawImage(bmp, 0, 0, w, h);
            const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type, quality }) : await new Promise((r) => canvas.toBlob(r, type, quality));
            if (blob && blob.size <= limit) {
              const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[type];
              return new File([blob], file.name.replace(/\.[^.]+$/, '.' + ext), { type, lastModified: Date.now() });
            }
          }
        }
      }
    } catch (_) { /* keep the original */ }
    return null;
  }

  async function convertImage(file, el) {
    const accept = (el.getAttribute('accept') || '').toLowerCase();
    const target = /png/.test(accept) ? 'image/png' : /webp/.test(accept) ? 'image/webp' : /jpe?g/.test(accept) ? 'image/jpeg' : null;
    if (!target || !file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return null;
    try {
      const bmp = await createImageBitmap(file);
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
      const g2 = canvas.getContext('2d');
      // JPEG has no transparency: put transparent images (a signature) on white, not black.
      if (target === 'image/jpeg') { g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, bmp.width, bmp.height); }
      g2.drawImage(bmp, 0, 0);
      const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: target, quality: 0.9 }) : await new Promise((r) => canvas.toBlob(r, target, 0.9));
      const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[target];
      return new File([blob], file.name.replace(/\.[^.]+$/, '.' + ext), { type: target, lastModified: Date.now() });
    } catch (_) { return null; }
  }

  // Upload text as the matching rules read it: camelCase split, "_" and "[]" as spaces.
  const uploadText = (s) => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\[\]]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();

  async function attachSampleFile(el, label, samples) {
    const fc = fileContext(el);
    const parts = { label: uploadText(fc.own), button: uploadText(fc.near), heading: uploadText(fc.heading), attrs: uploadText(`${el.name || ''} ${el.id || ''}`) };
    const accept = el.getAttribute('accept') || '';
    const limit = statedSizeLimit(el, [label, fc.own, fc.near, fc.heading].join(' ').toLowerCase());
    const slots = planUploadSlots(parts, accept, el.multiple);
    if (!slots.length) {
      return { ok: false, reason: accept ? `No sample file of a type this upload accepts (${tidy(accept, 40)})` : 'No sample file fits this upload' };
    }
    // If a sample could not be loaded, use the closest one that exists.
    const FALLBACK = { medicareBack: ['insuranceBack'], medicaidBack: ['insuranceBack'], photoIdBack: ['photoId'], documentImage: ['insuranceFront'], signature: ['documentImage'], clinicalImage: ['documentImage'], record: ['consent'], consent: ['record'], medicare: ['insuranceFront'], medicaid: ['insuranceFront'] };
    const chosen = [];
    let tooBig = null;
    for (const want of slots) {
      const keys = [];
      for (const s of [want, ...(FALLBACK[want] || [])]) keys.push(s, s + '@builtin');
      for (const key of keys) {
        if (!samples[key]) continue;
        let f;
        try { f = b64ToFile(samples[key]); } catch (_) { continue; } // damaged file: try the next one
        if (!acceptsFile(el, f.name, f.type)) f = await convertImage(f, el);
        if (!f || !acceptsFile(el, f.name, f.type)) continue;
        // Over the page's stated limit: save a smaller copy of an image, as a person would.
        if (f.size > limit) f = (await shrinkImage(f, limit, el)) || f;
        if (f.size > limit) { tooBig = tooBig || f.name; continue; }
        chosen.push(f);
        break;
      }
    }
    if (!chosen.length && tooBig) return { ok: false, reason: `The test file "${tooBig}" is larger than this upload allows` };
    if (!chosen.length) return { ok: false, reason: 'No sample file fits what this upload accepts' };
    const anchor = fileAnchor(el);
    const beforeText = anchor ? anchor.innerText || '' : '';
    const dt = new DataTransfer();
    chosen.forEach((f) => dt.items.add(f));
    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    const names = chosen.map((f) => f.name).join(', ');
    if (el.files && el.files.length) return { ok: true, value: names };
    // Many uploaders read the file and then reset their input: look for the file's name
    // or a new preview near the upload.
    const now = anchor ? anchor.innerText || '' : '';
    const shown = chosen.some((f) => now.includes(f.name)) || now !== beforeText || !!(anchor && anchor.parentElement && anchor.parentElement.querySelector('img[src^="blob:"], img[src^="data:"]'));
    return shown ? { ok: true, value: names } : { ok: false, reason: 'The page did not keep the file' };
  }

  // ---------- Special widgets (Pass D) ----------
  const CODE_EDITOR_SEL = '.CodeMirror, .cm-editor, .monaco-editor, .ace_editor';
  // Calendar popups of the common date-picker libraries (and ARIA ones that say so).
  const CALENDAR_ROOT_SEL = [
    '.flatpickr-calendar', '.react-datepicker', '.MuiDateCalendar-root', '.MuiPickersLayout-root', '.ant-picker-dropdown',
    '.el-picker-panel', '.mat-datepicker-content', '.p-datepicker', '.air-datepicker', '.datepicker-dropdown', '.datepicker.dropdown-menu',
    '.ui-datepicker', '.pika-single', '.daterangepicker', '.dp__menu', '.vc-container', '.v-date-picker', '.rdp', '.DayPicker',
    '.react-calendar', '.duet-date__dialog', '.vdp-datepicker__calendar', '.k-calendar', '.e-calendar', '.dx-calendar',
    '[role="dialog"][aria-label*="calendar" i]', '[role="dialog"][aria-label*="date" i]', '[role="application"][aria-label*="calendar" i]',
    '[role="grid"][aria-label*="calendar" i]', '[class*="calendar" i][class*="popup" i]', '[class*="datepicker" i][class*="popup" i]',
    // Mantine (its pickers' pop-up, and a calendar placed in a pop-up of the page's own).
    '[data-dates-dropdown]', '.mantine-Calendar-calendar', '.mantine-Calendar-calendarBase',
  ].join(', ');
  const MONTH_NAMES_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const monthIndex = (name) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(String(name).slice(0, 3).toLowerCase());

  // The calendar that opened for el: one that was not on screen before (or that el points
  // at), nearest to el.
  function openedCalendar(el, before) {
    const ctl = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    const owned = ctl && document.getElementById(ctl);
    const fresh = Array.from(document.querySelectorAll(CALENDAR_ROOT_SEL)).filter((c) => isShown(c) && !before.has(c) &&
      !Array.from(before).some((b) => b.contains(c)));
    const all = owned && isShown(owned) ? [owned, ...fresh] : fresh;
    // Outermost only.
    const roots = all.filter((c) => !all.some((o) => o !== c && o.contains(c)));
    if (!roots.length) return null;
    const r0 = el.getBoundingClientRect();
    const dist = (c) => { const r = c.getBoundingClientRect(); return Math.hypot(r.left - r0.left, r.top - r0.bottom); };
    return roots.sort((a, b) => dist(a) - dist(b))[0];
  }

  // The month a calendar shows: { y, m } (m 1-12), from its month / year controls or header.
  function shownMonth(cal) {
    let y = null;
    let m = null;
    for (const sel of cal.querySelectorAll('select')) {
      const texts = Array.from(sel.options).map((o) => o.textContent.trim());
      // (A calendar with a date limit may list only the months it allows.)
      if (texts.length && texts.every((t) => MONTH_NAMES_RE.test(t)) && sel.selectedIndex >= 0) m = monthIndex(texts[sel.selectedIndex].match(MONTH_NAMES_RE)[1]) + 1;
      else if (texts.length && texts.every((t) => /^\d{4}$/.test(t)) && sel.selectedIndex >= 0) y = +texts[sel.selectedIndex];
    }
    const staticMonth = cal.querySelector('.cur-month, .ui-datepicker-month:not(select), .pika-label');
    if (!m && staticMonth && MONTH_NAMES_RE.test(staticMonth.textContent)) m = monthIndex(staticMonth.textContent.match(MONTH_NAMES_RE)[1]) + 1;
    if (!y) {
      const yi = cal.querySelector('input.cur-year, .numInputWrapper input, input[type="number"][aria-label*="year" i]');
      if (yi && /^\d{4}$/.test(yi.value)) y = +yi.value;
    }
    if (y && m) return { y, m };
    const header = cal.querySelector('.react-datepicker__current-month, .MuiPickersCalendarHeader-label, .ui-datepicker-title, .pika-title, .datepicker-switch, .ant-picker-header-view, .el-date-picker__header, .air-datepicker-nav--title, .dp__month_year_wrap, .react-calendar__navigation__label, .vc-title, [class*="current-month" i], [class*="month-year" i], [class*="calendarHeaderLevel"]');
    const texts = [header && header.textContent, cal.textContent.slice(0, 400)].filter(Boolean);
    for (const t of texts) {
      const a = t.match(/\b([A-Za-z]{3,9})\.?,?\s*(\d{4})\b/);
      if (a && MONTH_NAMES_RE.test(a[1])) return { y: y || +a[2], m: m || monthIndex(a[1]) + 1 };
      const b = t.match(/\b(\d{4})\s*([A-Za-z]{3,9})\b/);
      if (b && MONTH_NAMES_RE.test(b[2])) return { y: y || +b[1], m: m || monthIndex(b[2]) + 1 };
    }
    return null;
  }

  const OUTSIDE_DAY_RE = /outside|other-?month|prev-?month|next-?month|prevMonthDay|nextMonthDay|\bold\b|\bnew\b|adjacent|neighbou?ring/i;
  const DISABLED_DAY_RE = /disabled|unavailable|not-?allowed|blocked/i;
  const classOf = (n) => (n && typeof n.className === 'string' ? n.className : '');
  const dayDisabled = (c) => c.matches(':disabled, [aria-disabled="true"], [data-disabled="true"]') || !!c.closest('[aria-disabled="true"]') ||
    DISABLED_DAY_RE.test(classOf(c)) || DISABLED_DAY_RE.test(classOf(c.parentElement));

  // A day cell of cal that stands for y-m-d: by its attributes, or — when the calendar
  // shows that month — by its number.
  function findDayCell(cal, y, m, d) {
    const iso = [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-');
    const names = [MONTHS[m - 1], MONTHS[m - 1].slice(0, 3)].join('|');
    const said = new RegExp('\\b(' + names + ')\\.?\\s+' + d + '(st|nd|rd|th)?\\b,?\\s+' + y + '\\b|\\b' + d + '(st|nd|rd|th)?\\s+(of\\s+)?(' + names + ')\\.?,?\\s+' + y + '\\b', 'i');
    const sameDay = (v) => {
      const n = Number(v);
      if (!v || !Number.isFinite(n) || n < 1e11) return false;
      const t = new Date(n);
      return (t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d) || (t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d);
    };
    const cells = Array.from(cal.querySelectorAll('[role="gridcell"], td, button, [class*="day" i], [class*="cell" i], [data-date], [data-value], [aria-label]'))
      .filter((c) => isShown(c));
    for (const c of cells) {
      const attrs = [c.getAttribute('aria-label'), c.getAttribute('title'), c.getAttribute('data-date'), c.getAttribute('data-value'), c.getAttribute('data-day'),
        c.getAttribute('data-iso'), c.getAttribute('data-test'), c.getAttribute('data-testid'), c.id].filter(Boolean);
      const hit = attrs.some((a) => said.test(a) || a.startsWith(iso) || a.includes('dp-' + iso) || sameDay(a)) ||
        sameDay(c.getAttribute('data-timestamp')) ||
        (c.getAttribute('data-pika-year') === String(y) && c.getAttribute('data-pika-month') === String(m - 1) && c.getAttribute('data-pika-day') === String(d)) ||
        (c.getAttribute('data-year') === String(y) && c.getAttribute('data-month') === String(m - 1) && c.textContent.trim() === String(d));
      if (hit) return c.querySelector('button, a, .ant-picker-cell-inner, .flatpickr-day') || c;
    }
    // Days that carry their dates are the truth (a year box may show a year the calendar
    // has not moved to): then only an exact match counts.
    if (cells.some((c) => /\b(1[89]|2\d)\d{2}\b/.test((c.getAttribute('aria-label') || '') + ' ' + (c.getAttribute('title') || '')) || c.hasAttribute('data-date') || c.hasAttribute('data-timestamp'))) return null;
    const shown = shownMonth(cal);
    if (!shown || shown.y !== y || shown.m !== m) return null;
    // (Days of the months around it are marked by class, or by data-outside in Mantine.)
    const numbered = cells.filter((c) => c.textContent.trim() === String(d) && !c.querySelector('[role="gridcell"], td, button') &&
      !OUTSIDE_DAY_RE.test(classOf(c)) && !OUTSIDE_DAY_RE.test(classOf(c.parentElement)) && !c.closest('[data-outside="true"]'));
    return numbered[0] || null;
  }

  // Moves cal toward { y, m }: its month / year controls, else its previous / next buttons.
  // False when it cannot move.
  async function stepCalendar(cal, y, m) {
    const shown = shownMonth(cal);
    if (!shown) return false;
    let changed = false;
    for (const sel of cal.querySelectorAll('select')) {
      const opts = Array.from(sel.options);
      const texts = opts.map((o) => o.textContent.trim());
      let i = -1;
      if (texts.length && texts.every((t) => MONTH_NAMES_RE.test(t))) { if (shown.m !== m) i = texts.findIndex((t) => monthIndex((t.match(MONTH_NAMES_RE) || [])[1] || '') === m - 1); }
      else if (texts.length && texts.every((t) => /^\d{4}$/.test(t))) { if (shown.y !== y) i = texts.indexOf(String(y)); }
      if (i >= 0 && sel.selectedIndex !== i && !opts[i].disabled) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
    }
    const yi = cal.querySelector('input.cur-year, .numInputWrapper input, input[type="number"][aria-label*="year" i]');
    if (yi && shown.y !== y) {
      nativeSet(yi, String(y));
      yi.dispatchEvent(new Event('input', { bubbles: true }));
      yi.dispatchEvent(new Event('change', { bubbles: true }));
      // (flatpickr reads its year box on key-up.)
      yi.dispatchEvent(new KeyboardEvent('keyup', { key: String(y).slice(-1), bubbles: true, cancelable: true }));
      changed = true;
    }
    if (changed) {
      await sleep(80);
      const now = shownMonth(cal);
      if (now && (now.y !== shown.y || now.m !== shown.m)) return true;
    }
    const diff = (y - shown.y) * 12 + (m - shown.m);
    if (!diff) return false;
    // (Mantine's arrows say which way only by data-previous / data-next.)
    const label = (b) => [b.getAttribute('aria-label'), b.getAttribute('title'), classOf(b), b.children.length ? '' : b.textContent,
      b.hasAttribute('data-previous') ? 'previous' : '', b.hasAttribute('data-next') ? 'next' : ''].join(' ');
    const btns = Array.from(cal.querySelectorAll('button, [role="button"], a, span, div')).filter((b) => isShown(b) && b.children.length <= 2 && label(b).length < 200);
    const dirRe = diff < 0 ? /prev|previous|back|‹|«|<|left/i : /next|forward|›|»|>|right/i;
    const yearBtn = btns.find((b) => dirRe.test(label(b)) && /year|super|double|fast|decade/i.test(label(b)));
    // A year or more away in a Mantine calendar: through its header (month → year → decade).
    if (Math.abs(diff) >= 12 && !yearBtn && await mantineJump(cal, y, m)) return true;
    const monthBtn = btns.find((b) => dirRe.test(label(b)) && !/year|super|double|fast|decade|today|clear|close|done|cancel|\bok\b/i.test(label(b)));
    const btn = Math.abs(diff) >= 12 && yearBtn ? yearBtn : monthBtn;
    if (!btn) return false;
    fireOpenStrong(btn);
    await sleep(60);
    const after = shownMonth(cal);
    return !!after && (after.y !== shown.y || after.m !== shown.m);
  }

  // Mantine's calendar header names the level shown ("October 2026" → "2026" → "2020 – 2029"):
  // up to the decade, across decades to the year, then that year's month — as a person would.
  // True when it shows y-m.
  async function mantineJump(cal, y, m) {
    // (At the top level the header is plain text, not a button.)
    const level = () => Array.from(cal.querySelectorAll('[class*="calendarHeaderLevel"]')).find(isShown) || null;
    const headerText = () => ((level() || {}).textContent || '').trim();
    const press = async (b) => { fireOpenStrong(b); await sleep(80); };
    const inGrid = (b) => isShown(b) && !String(b.className).includes('calendarHeader') && !dayDisabled(b);
    let lv = level();
    if (!lv || lv.disabled) return false;
    await press(lv); // the year: its months
    lv = level();
    if (!lv || lv.disabled || !/^\d{4}$/.test(headerText())) return false;
    await press(lv); // the decade: its years
    for (let i = 0; ; i++) {
      if (userStopped() || i >= 30) return false;
      const yearBtn = Array.from(cal.querySelectorAll('button')).find((b) => inGrid(b) && b.textContent.trim() === String(y));
      if (yearBtn) { await press(yearBtn); break; }
      const first = Number((headerText().match(/\d{4}/) || [])[0]);
      if (!first) return false;
      const step = Array.from(cal.querySelectorAll(y < first ? 'button[data-previous]' : 'button[data-next]')).find((b) => isShown(b) && !b.disabled);
      if (!step) return false;
      await press(step);
    }
    const monthBtn = Array.from(cal.querySelectorAll('button')).find((b) => inGrid(b) && MONTH_NAMES_RE.test(b.textContent) &&
      monthIndex(b.textContent.trim().match(MONTH_NAMES_RE)[1]) === m - 1);
    if (!monthBtn) return false;
    await press(monthBtn);
    const now = shownMonth(cal);
    return !!now && now.y === y && now.m === m;
  }

  // Opens el's calendar and clicks the day iso (YYYY-MM-DD) — for a range, then endIso.
  // { ok: true } / { ok: false, reason } / { ok: null, reason } (the date is not offered).
  async function pickCalendarDate(el, iso, endIso) {
    const before = new Set(Array.from(document.querySelectorAll(CALENDAR_ROOT_SEL)).filter(isShown));
    const popupsBefore = new Set(shownPopups());
    fireOpenStrong(el);
    let cal = null;
    await waitUntil(() => (cal = openedCalendar(el, before)), 900);
    if (!cal) return { ok: null, reason: 'A read-only box that opened no calendar' };
    const pick = async (dayIso) => {
      const [y, m, d] = dayIso.split('-').map(Number);
      const notReached = { ok: false, reason: 'Could not reach ' + MONTHS[m - 1] + ' ' + y + ' in this calendar' };
      for (let step = 0; step < 90; step++) {
        if (userStopped()) return { ok: null, reason: USER_STOP_REASON }; // (the calendar is closed below)
        const cell = findDayCell(cal, y, m, d);
        if (cell) {
          if (dayDisabled(cell)) return { ok: null, reason: 'The calendar does not offer that date' };
          fireOpenStrong(cell);
          await sleep(120);
          return { ok: true };
        }
        if (!cal.isConnected || !(await stepCalendar(cal, y, m))) return notReached;
      }
      return notReached;
    };
    let r = await pick(iso);
    if (r.ok === true && endIso && cal.isConnected && isShown(cal)) r = await pick(endIso);
    await sleep(100);
    if (cal.isConnected && isShown(cal)) {
      // A Mantine calendar stays open after the pick (it waits for a time, or its ✓): closed
      // the way a person would — its box clicked again, or a click beside the form's fields.
      // (Never Escape: in a Mantine drawer that closes the drawer too.)
      const mantine = cal.matches('[data-dates-dropdown], .mantine-Calendar-calendar, .mantine-Calendar-calendarBase');
      if (mantine) activeClose = { el, trigger: el, popupsBefore, ariaLive: el.getAttribute('aria-expanded') === 'true', list: cal, panel: cal };
      try { await closeDropdown(el); } catch (_) { /* best effort */ } finally { if (mantine) activeClose = null; }
    }
    if (r.ok !== true) return r;
    return pickerBoxValue(el) ? { ok: true } : { ok: false, reason: 'The calendar did not set a date' };
  }
  // The date a picker's box shows: an input's value, or a button's text (not its placeholder).
  function pickerBoxValue(el) {
    if (el.tagName === 'INPUT') return el.value.trim();
    let t = el.textContent || '';
    for (const p of el.querySelectorAll('[class*="placeholder" i]')) t = t.replace(p.textContent || '', '');
    return t.trim();
  }

  // A widget's name: its own aria-label first (text beside it can belong to another control —
  // a text editor right after a row of choice buttons took their words), then its label, then
  // its placeholder. '' when it has none.
  function widgetLabel(el) {
    // (Without a trailing required mark: "Date of Enrollment *" → "Date of Enrollment", as fieldLabel.)
    return tidy(el.getAttribute('aria-label') || dropdownLabelText(el) || el.getAttribute('placeholder') || '', 60).replace(/\s*[*:]+$/, '');
  }

  // Short realistic text for an editable box, by what its label asks for.
  function editableText(label, key, mode, dataset) {
    if (mode !== 'valid') return String(genericValue(dataset) ?? dataset.comment ?? '');
    const l = label.toLowerCase();
    if (/surger|procedure|operation/.test(l)) return 'Appendectomy (2015); left knee arthroscopy (2019). No complications reported.';
    if (/family/.test(l) && /histor/.test(l)) return 'Father: hypertension and type 2 diabetes. Mother: hypothyroidism. No family history of heart disease or cancer reported in siblings.';
    if (/allerg/.test(l)) return 'No known drug allergies. Seasonal pollen allergy managed with over-the-counter antihistamines.';
    if (/medication|prescription|\bmeds?\b/.test(l)) return 'Lisinopril 10 mg once daily; metformin 500 mg twice daily with meals.';
    if (key && typeof dataset[key] === 'string' && dataset[key] && !['comment', 'notes', 'bio'].includes(key)) return dataset[key];
    return String(dataset.notes || dataset.comment || '');
  }

  function collectSpecialWidgets() {
    const out = [];
    const usable = (el) => isShown(el) && inFillScope(el) && !isInNavRegion(el) && !el.closest(CODE_EDITOR_SEL) && !el.closest('[aria-hidden="true"]');

    // Editable text boxes (the outermost editable element only).
    for (const el of document.querySelectorAll('[contenteditable=""], [contenteditable="true"], [role="textbox"]:not(input):not(textarea)')) {
      if (!el.isContentEditable || !usable(el)) continue;
      if (el.parentElement && el.parentElement.closest('[contenteditable=""], [contenteditable="true"]')) continue;
      const label = widgetLabel(el);
      const key = resolveKey(label, []);
      out.push({
        el, label: label || 'Text editor with no label', key,
        hasValue: () => el.textContent.trim() !== '',
        display: () => { const t = el.textContent || ''; return t.trim() ? tidy(t.trim(), 60) : t.length ? `(${t.length} spaces)` : '—'; },
        fill: async (mode, dataset, opts) => {
          // "Each field's own limits": a text editor declares no length, so — as for other text
          // fields without one — 1 character at minimum, 255 at maximum, 256 above it.
          const lim = limitOf(mode, opts);
          if (lim === 'under') return { ok: null, reason: 'No minimum length declared' };
          const v = lim ? 'Abcdefghij'.repeat(26).slice(0, lim === 'min' ? 1 : lim === 'max' ? DEFAULT_MAX_LENGTH : DEFAULT_MAX_LENGTH + 1)
            : editableText(label, key, mode, dataset);
          // The text is there. ("Just spaces" counts its spaces: an editor may keep them as
          // non-breaking spaces, which trim() removes.)
          const kept = () => (String(v).trim() ? el.textContent.trim() !== '' : el.textContent.length >= String(v).length);
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
          let done = false;
          try { done = document.execCommand('insertText', false, v); } catch (_) { done = false; }
          if (!done || !kept()) {
            el.textContent = v;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: v }));
          }
          await sleep(50);
          el.blur();
          return kept() ? { ok: true } : { ok: false, reason: 'The editor did not keep the text' };
        },
      });
    }

    // ARIA sliders and spin buttons (native range / number inputs are handled in Pass A).
    for (const el of document.querySelectorAll('[role="slider"]:not(input), [role="spinbutton"]:not(input)')) {
      if (!usable(el) || el.getAttribute('aria-disabled') === 'true') continue;
      const spin = el.getAttribute('role') === 'spinbutton';
      const min = Number(el.getAttribute('aria-valuemin') ?? 0) || 0;
      const max = Number(el.getAttribute('aria-valuemax') ?? (spin ? 10 : 100));
      const now = () => el.getAttribute('aria-valuenow');
      const label = widgetLabel(el) || 'Slider with no label';
      out.push({
        el, label, key: null,
        hasValue: () => now() !== null && now() !== '' && Number(now()) !== min,
        display: () => now() || '—',
        fill: async (mode, dataset, opts) => {
          // "Each field's own limits": its own minimum / maximum — it cannot go outside them.
          const lim = limitOf(mode, opts);
          if (lim === 'under' || lim === 'over') return { ok: null, reason: `A ${spin ? 'number control' : 'slider'} cannot go ${lim === 'under' ? 'below its minimum' : 'above its maximum'}` };
          const span = Math.max(1, max - min);
          const target = lim === 'min' ? min : mode === 'edge' ? max : spin ? Math.min(max, min + 1 + Math.floor(Math.random() * Math.min(5, span)))
            : Math.round(min + span * (0.3 + Math.random() * 0.4));
          el.focus();
          // (0 is a value: a slider from -10 to 10 that shows 0 is not at its minimum.)
          const valueNow = () => { const v = now(); return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null; };
          const cur = valueNow() ?? min;
          const key = target >= cur ? (spin ? 'ArrowUp' : 'ArrowRight') : (spin ? 'ArrowDown' : 'ArrowLeft');
          const press = () => {
            el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }));
          };
          // One press first: it shows the control's step (1, 5, 0.1…), so the rest land on the target.
          if (target !== cur) {
            press();
            await sleep(20);
            const moved = valueNow() === null ? 0 : Math.abs(valueNow() - cur);
            const presses = moved > 0 ? Math.round(Math.abs(target - cur) / moved) - 1 : Math.abs(target - cur) - 1;
            for (let i = 0; i < Math.min(500, Math.max(0, presses)); i++) press();
          }
          await sleep(30);
          if (valueNow() === target || (valueNow() !== null && valueNow() !== cur && Math.abs(valueNow() - target) <= span / 20)) return { ok: true };
          // Keys ignored: for a spin button press its "+" button; for a slider click the track.
          if (spin) {
            const box = el.parentElement;
            const plus = box && Array.from(box.querySelectorAll('button, [role="button"]')).find((b) => /increase|increment|\+|up|more/i.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent));
            if (plus) for (let i = valueNow() ?? min, n = 0; i < target && n < 500; i++, n++) plus.click();
          } else {
            // The slider element is often just the thumb: the click goes on the track around it.
            const r = el.getBoundingClientRect();
            let track = el.parentElement;
            for (let d = 0; track && d < 4 && track.getBoundingClientRect().width < Math.max(60, r.width * 3); d++) track = track.parentElement;
            const tr = track && track.getBoundingClientRect().width >= Math.max(60, r.width * 3) ? track.getBoundingClientRect() : r;
            const hit = track && tr !== r ? track : el;
            const x = tr.left + tr.width * ((target - min) / span);
            const y = tr.top + tr.height / 2;
            for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
              hit.dispatchEvent(new (t.startsWith('pointer') && typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
            }
          }
          await sleep(30);
          return now() !== null && now() !== '' && Number(now()) !== cur ? { ok: true } : { ok: false, reason: 'The control did not move' };
        },
      });
    }

    // Read-only boxes that open a calendar (date / range pickers you cannot type into) — and
    // Mantine's date pickers, which are buttons showing the date.
    for (const el of document.querySelectorAll('input[readonly]:not([type=hidden]), button[data-dates-input][class*="DatePickerInput-input"], button[data-dates-input][class*="DateTimePicker-input"]')) {
      if (!usable(el) || el.disabled || isHoneypot(el) || el.getAttribute('role') === 'combobox') continue;
      // (Words that only contain "date" / "range" — "validate", "updated", "orange", "arrange" —
      // say nothing about a calendar.)
      const hint = (el.className + ' ' + (el.placeholder || '') + ' ' + getLabelText(el)).toLowerCase()
        .replace(/[a-z]*(validat|updat|candidat|mandat|accommodat|consolidat|liquidat|orange|arrange|strange|grange)[a-z]*/g, ' ');
      if (!/flatpickr|date|calendar|period|range|pick\s+(a\s+)?(start|end|day)/.test(hint)) continue;
      const range = /range|period|start\s+and\s+end|from\b.*\bto\b|between/.test(hint);
      const label = widgetLabel(el) || getLabelText(el) || 'Date field with no label';
      let key = null;
      try { key = classify(el); } catch (_) { key = null; }
      out.push({
        el, label, key: range ? 'dateRange' : DATE_KEYS.includes(key) ? key : 'today',
        hasValue: () => pickerBoxValue(el) !== '',
        display: () => pickerBoxValue(el) || '—',
        fill: async (mode, dataset, opts) => {
          if (mode === 'edge' && /^limit-/.test(String((opts && opts.edgeType) || ''))) return { ok: null, reason: 'A calendar has no limits to test' };
          // The field's own date (a birth date for DOB, the visit date for a visit…), the
          // same one a typed date field gets.
          const own = DATE_KEYS.includes(key) ? key : 'today';
          let iso = toISODate(dataset[dateKeyFor(own)] ?? dataset.today);
          if (!isRealDate(iso)) {
            // A calendar only offers real days: invalid data that is not a real date ("99/99/9999")
            // becomes a real but impossible one — the same as a date box gets.
            iso = mode === 'invalid'
              ? ({ terminationDate: '2000-01-01', appointmentDate: '2000-01-01', dateOfService: '2099-12-31' }[own] || '2099-12-31')
              : toISODate(dataset.today);
          }
          if (!isRealDate(iso)) return { ok: null, reason: 'No date to enter' };
          let endIso = null;
          if (range) {
            const t = new Date(iso + 'T12:00:00');
            t.setDate(t.getDate() + 4);
            endIso = [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
          }
          return pickCalendarDate(el, iso, endIso);
        },
      });
    }
    return out;
  }

  // ---------- Dropdown inspection (troubleshooting) ----------
  // For dropdowns that are still empty: open each one the way a pointer would, record the
  // STRUCTURE of the list that appears (tags, classes, roles — plus up to three short
  // option texts), close it again. Used by the popup's "Copy dropdown details" so a
  // dropdown FillCraft cannot handle can be diagnosed without DevTools.
  async function inspectDropdowns() {
    if (window.__qaFormFillerBusy) return { error: 'A fill is running on this page — try again once it is done' };
    window.__qaFormFillerBusy = true;
    try { return await inspectDropdownsInner(); } finally { window.__qaFormFillerBusy = false; }
  }
  async function inspectDropdownsInner() {
    scopeToOpenDialog();
    // Structure only: tags, classes, roles. No page text is copied — a text is described
    // by its length — and long numbers in attributes (record ids) are masked.
    const mask = (v) => String(v).replace(/\d{3,}/g, '#');
    const shape = (e, d = 0) => e && ({
      t: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 6).map(mask).join('.') : ''),
      a: Array.from(e.attributes).filter((x) => /^(role|aria-(?!label|valuetext|description)|type|readonly|tabindex|data-testid)/.test(x.name)).map((x) => x.name + '=' + mask(x.value.slice(0, 30))).join(' ') || undefined,
      x: e.children.length ? undefined : ((e.textContent || '').trim() ? `(text, ${(e.textContent || '').trim().length} chars)` : undefined),
      k: d < 6 ? Array.from(e.children).slice(0, 4).map((c) => shape(c, d + 1)) : undefined,
    });
    // The field's own label only (never text taken from around it).
    const ownLabel = (el) => {
      const inner = el.querySelector('label, .MuiInputLabel-root, legend');
      const byId = el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby').split(/\s+/)[0]);
      return tidy((inner && inner.textContent) || el.getAttribute('aria-label') || (byId && byId.textContent) || '', 40) || '(no label of its own)';
    };
    const out = [];
    const controls = discoverCustomDropdowns().map((d) => d.control)
      .filter((c) => c.isConnected && !isCustomDropdownFilled(c) && !isDisabledDropdown(c)).slice(0, 5);
    for (const el of controls) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      // Same click targets as the fill, in order, until something appears.
      const tries = [...new Set([hit && el.contains(hit) ? hit : null,
        el.querySelector('.MuiInputBase-input, .MuiSelect-select, [role="combobox"], input:not([type=hidden])'), el].filter(Boolean))];
      let target = el, added = [];
      for (const t of tries) {
        target = t;
        const before = new Set(document.querySelectorAll('body *'));
        fireOpenStrong(t);
        // (A list that loads from the server shows up after a moment: only a swapped arrow
        // icon at first.)
        const addedNow = () => Array.from(document.querySelectorAll('body *')).filter((n) => !before.has(n));
        await waitUntil(() => addedNow().length >= 4, 3000);
        added = addedNow();
        if (added.length) break;
      }
      // The list: the new block with the most new elements inside (not a swapped arrow icon).
      const addedSet = new Set(added);
      const tops = added.filter((n) => !addedSet.has(n.parentElement));
      const top = tops.sort((a, b) => b.querySelectorAll('*').length - a.querySelectorAll('*').length)[0] || null;
      const leaves = added.filter((n) => !n.children.length && (n.textContent || '').trim().length > 1 && (!top || top.contains(n)));
      let row = leaves[1] || leaves[0] || null;
      // Up to the option row (the box holding its checkbox, if it has one) — never past the
      // list itself (that would reach <body>).
      const box = row && rowCheckbox(row);
      if (box && top && top.contains(box)) {
        for (let p = box.parentElement; p && top.contains(p); p = p.parentElement) { if (p.contains(row)) { row = p; break; } }
      } else {
        for (let i = 0; i < 4 && row && row.parentElement && row !== top && top && top.contains(row.parentElement); i++) row = row.parentElement;
      }
      out.push({
        label: ownLabel(el),
        field: shape(el),
        clicked: shape(target, 5),
        expandedNow: el.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') || el.getAttribute('aria-expanded') || null,
        newElements: added.length,
        optionsFillCraftSees: findVisibleOptions().length,
        rawOptionsSeen: findVisibleOptionsRaw().length,
        popupTop: shape(top),
        optionRow: shape(row),
      });
      await closeDropdown(el);
      // Its own list still open: one more click on what opened it (a toggle). Not for options
      // of another list on the page — that click would open this one again.
      if ((top && top.isConnected && isVisible(top) && findVisibleOptionsRaw().some((o) => top.contains(o))) || saysExpanded(el, target)) {
        fireOpenStrong(target);
        await sleep(300);
      }
    }
    return { inspect: out };
  }

  // ---------- Global API ----------
  // popup.js / background.js invoke these in EVERY frame (incl. iframes) via
  // chrome.scripting.executeScript({ allFrames: true, func }) and aggregate the
  // per-frame results.
  // Inside a CAPTCHA service's own frame (reCAPTCHA, hCaptcha, Turnstile…) FillCraft does
  // nothing at all (the runner also leaves those frames out).
  const IN_CAPTCHA_FRAME = (() => {
    try {
      if (window === window.top) return false;
      const h = location.hostname;
      return /(^|\.)(hcaptcha\.com|recaptcha\.net|arkoselabs\.com|funcaptcha\.com|geetest\.com|captcha-delivery\.com|mtcaptcha\.com|friendlycaptcha\.(com|eu))$/i.test(h) ||
        /^challenges\.cloudflare\.com$/i.test(h) || (/(^|\.)(google\.com|gstatic\.com)$/i.test(h) && /^\/recaptcha\//.test(location.pathname));
    } catch (_) { return false; }
  })();
  const NOTHING_HERE = () => Promise.resolve({ filled: 0, skipped: 0, failed: 0, total: 0, log: [] });
  window.__qaFormFiller = {
    fill:   (payload) => (IN_CAPTCHA_FRAME ? NOTHING_HERE() : withGuard(() => withLabelCache(() => fillForm(payload || {})))),
    clear:  (payload) => (IN_CAPTCHA_FRAME ? NOTHING_HERE() : withGuard(() => withLabelCache(() => clearForm(payload || {})))),
    detect: (payload) => (IN_CAPTCHA_FRAME ? NOTHING_HERE() : withLabelCache(() => detect(payload || {}))),
    reveal: (payload) => reveal(payload || {}),
    inspect: () => withGuard(() => inspectDropdowns()),
    // The right-clicked field, for the right-click menu ("Treat this field as…").
    describeTarget: () => (IN_CAPTCHA_FRAME ? { ok: false, reason: 'Not here.' } : withLabelCache(() => describeTarget())),
    dialogFrames: (nonce) => dialogFrames(nonce),
    unmarkDialog: () => unmarkDialog(),
  };
})();
