// Realistic US data + invalid/edge-case generators.
// Includes US Healthcare standard fields (NPI, MRN, ICD-10, CPT, etc.)
// Exposed on globalThis.QAData (window.QAData in pages) so content.js can read it.

(function () {
  // ---------- Identity datasets ----------
  const FIRST_NAMES_M = ['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Donald','Mark','Paul','Steven','Andrew','Kenneth','Brian','Kevin','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan'];
  const FIRST_NAMES_F = ['Mary','Patricia','Jennifer','Linda','Elizabeth','Barbara','Susan','Jessica','Sarah','Karen','Nancy','Lisa','Margaret','Betty','Sandra','Ashley','Kimberly','Emily','Donna','Michelle','Carol','Amanda','Melissa','Deborah','Stephanie','Rebecca','Laura','Sharon','Cynthia','Amy'];
  const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores'];

  const STREET_NAMES = ['Main','Oak','Pine','Maple','Cedar','Elm','Washington','Lake','Hill','Park','Walnut','Sunset','Lincoln','Jefferson','Madison','Adams','Jackson','River','Spring','Highland','Forest','Meadow','Church','School','Mill'];
  const STREET_TYPES = ['St','Ave','Blvd','Rd','Dr','Ln','Way','Ct','Pl'];

  // Downtown street-delivery ZIPs (not PO-Box-only / unique ZIPs, which fail
  // address validation when paired with a street address) + the city's area code.
  const LOCATIONS = [
    { city: 'New York',       state: 'NY', zip: '10001', area: '212', tz: 'ET' },
    { city: 'Los Angeles',    state: 'CA', zip: '90012', area: '213', tz: 'PT' },
    { city: 'Chicago',        state: 'IL', zip: '60601', area: '312', tz: 'CT' },
    { city: 'Houston',        state: 'TX', zip: '77002', area: '713', tz: 'CT' },
    { city: 'Phoenix',        state: 'AZ', zip: '85004', area: '602', tz: 'AZ' },
    { city: 'Philadelphia',   state: 'PA', zip: '19103', area: '215', tz: 'ET' },
    { city: 'San Antonio',    state: 'TX', zip: '78205', area: '210', tz: 'CT' },
    { city: 'San Diego',      state: 'CA', zip: '92101', area: '619', tz: 'PT' },
    { city: 'Dallas',         state: 'TX', zip: '75201', area: '214', tz: 'CT' },
    { city: 'San Jose',       state: 'CA', zip: '95113', area: '408', tz: 'PT' },
    { city: 'Austin',         state: 'TX', zip: '78701', area: '512', tz: 'CT' },
    { city: 'Jacksonville',   state: 'FL', zip: '32202', area: '904', tz: 'ET' },
    { city: 'Fort Worth',     state: 'TX', zip: '76102', area: '817', tz: 'CT' },
    { city: 'Columbus',       state: 'OH', zip: '43215', area: '614', tz: 'ET' },
    { city: 'Charlotte',      state: 'NC', zip: '28202', area: '704', tz: 'ET' },
    { city: 'Indianapolis',   state: 'IN', zip: '46204', area: '317', tz: 'IN' },
    { city: 'Seattle',        state: 'WA', zip: '98101', area: '206', tz: 'PT' },
    { city: 'Denver',         state: 'CO', zip: '80202', area: '303', tz: 'MT' },
    { city: 'Boston',         state: 'MA', zip: '02108', area: '617', tz: 'ET' },
    { city: 'Nashville',      state: 'TN', zip: '37203', area: '615', tz: 'CT' },
    { city: 'Portland',       state: 'OR', zip: '97201', area: '503', tz: 'PT' },
    { city: 'Atlanta',        state: 'GA', zip: '30303', area: '404', tz: 'ET' },
    { city: 'Miami',          state: 'FL', zip: '33130', area: '305', tz: 'ET' },
    { city: 'Minneapolis',    state: 'MN', zip: '55401', area: '612', tz: 'CT' },
    { city: 'Cleveland',      state: 'OH', zip: '44113', area: '216', tz: 'ET' },
  ];

  const STATES = [
    {name:'Alabama',code:'AL'},{name:'Alaska',code:'AK'},{name:'Arizona',code:'AZ'},{name:'Arkansas',code:'AR'},
    {name:'California',code:'CA'},{name:'Colorado',code:'CO'},{name:'Connecticut',code:'CT'},{name:'Delaware',code:'DE'},
    {name:'Florida',code:'FL'},{name:'Georgia',code:'GA'},{name:'Hawaii',code:'HI'},{name:'Idaho',code:'ID'},
    {name:'Illinois',code:'IL'},{name:'Indiana',code:'IN'},{name:'Iowa',code:'IA'},{name:'Kansas',code:'KS'},
    {name:'Kentucky',code:'KY'},{name:'Louisiana',code:'LA'},{name:'Maine',code:'ME'},{name:'Maryland',code:'MD'},
    {name:'Massachusetts',code:'MA'},{name:'Michigan',code:'MI'},{name:'Minnesota',code:'MN'},{name:'Mississippi',code:'MS'},
    {name:'Missouri',code:'MO'},{name:'Montana',code:'MT'},{name:'Nebraska',code:'NE'},{name:'Nevada',code:'NV'},
    {name:'New Hampshire',code:'NH'},{name:'New Jersey',code:'NJ'},{name:'New Mexico',code:'NM'},{name:'New York',code:'NY'},
    {name:'North Carolina',code:'NC'},{name:'North Dakota',code:'ND'},{name:'Ohio',code:'OH'},{name:'Oklahoma',code:'OK'},
    {name:'Oregon',code:'OR'},{name:'Pennsylvania',code:'PA'},{name:'Rhode Island',code:'RI'},{name:'South Carolina',code:'SC'},
    {name:'South Dakota',code:'SD'},{name:'Tennessee',code:'TN'},{name:'Texas',code:'TX'},{name:'Utah',code:'UT'},
    {name:'Vermont',code:'VT'},{name:'Virginia',code:'VA'},{name:'Washington',code:'WA'},{name:'West Virginia',code:'WV'},
    {name:'Wisconsin',code:'WI'},{name:'Wyoming',code:'WY'},
  ];

  const COMPANIES = ['Acme Corp','Globex','Initech','Umbrella Inc','Stark Industries','Wayne Enterprises','Hooli','Pied Piper','Soylent','Vandelay Industries','Cyberdyne Systems','Massive Dynamic'];
  const JOB_TITLES = ['Software Engineer','Product Manager','QA Analyst','Account Executive','Operations Manager','Marketing Specialist','Data Analyst','UX Designer','HR Coordinator','Sales Director','Registered Nurse','Medical Assistant','Office Manager'];

  // Test credit card numbers (publicly published gateway test PANs)
  const TEST_CC = [
    { number: '4111111111111111', cvv: '123', brand: 'Visa' },
    { number: '5555555555554444', cvv: '321', brand: 'Mastercard' },
    { number: '378282246310005',  cvv: '1234', brand: 'Amex' },
    { number: '6011111111111117', cvv: '987', brand: 'Discover' },
  ];

  // ---------- US Healthcare datasets ----------
  // Carriers with the plan types they sell and their member-ID prefix, so carrier, plan
  // type, plan name and member ID agree. Medicare coverage only for patients 65+.
  const CARRIERS = [
    { name: 'Aetna', prefix: 'AET', types: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP'] },
    { name: 'Anthem Blue Cross Blue Shield', prefix: 'ANT', types: ['HMO', 'PPO', 'EPO', 'HDHP'] },
    { name: 'Blue Cross Blue Shield', prefix: 'BCB', types: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP'] },
    { name: 'Cigna', prefix: 'CIG', types: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP'] },
    { name: 'Humana', prefix: 'HUM', types: ['HMO', 'PPO', 'Medicare Advantage'] },
    { name: 'Kaiser Permanente', prefix: 'KAI', types: ['HMO', 'HDHP', 'Medicare Advantage'] },
    { name: 'UnitedHealthcare', prefix: 'UHC', types: ['HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare Advantage'] },
    { name: 'Molina Healthcare', prefix: 'MOL', types: ['HMO', 'Medicaid Managed Care'] },
    { name: 'Centene', prefix: 'CEN', types: ['HMO', 'Medicaid Managed Care'] },
    { name: 'WellCare', prefix: 'WEL', types: ['Medicare Advantage', 'Medicaid Managed Care'] },
    { name: 'Tricare', prefix: 'TRI', types: ['HMO', 'PPO'], plans: { HMO: ['TRICARE Prime'], PPO: ['TRICARE Select'] } },
    { name: 'Medicare', prefix: 'MCR', types: ['Medicare'] },
    { name: 'Medicaid', prefix: 'MCD', types: ['Medicaid Managed Care'] },
    { name: 'Highmark', prefix: 'HMK', types: ['HMO', 'PPO', 'EPO'] },
    { name: 'Health Net', prefix: 'HNT', types: ['HMO', 'PPO', 'EPO'] },
  ];
  const MEDICARE_TYPES = ['Medicare', 'Medicare Advantage'];
  // (No plan name starts with "Select / Choose / Pick": a dropdown showing it would look
  // like its own "Select…" placeholder, i.e. still empty.)
  const PLAN_NAMES_BY_TYPE = {
    HMO: ['Silver HMO 2500', 'Gold HMO 1500', 'Value Network HMO'],
    PPO: ['Gold PPO 1000', 'Platinum PPO 500', 'Choice Plus PPO'],
    EPO: ['Essential EPO 3000', 'Preferred EPO'],
    POS: ['Open Access POS', 'Choice POS II'],
    HDHP: ['Bronze HSA 5000', 'Silver HSA 3500'],
    'Medicare Advantage': ['Medicare Advantage HMO', 'Medicare Advantage PPO'],
    'Medicaid Managed Care': ['Medicaid Managed Care Plan', 'State Health Plan'],
    Medicare: ['Original Medicare Part A & B'],
  };

  // Common ICD-10 diagnosis codes (real, widely used)
  const ICD10_CODES = [
    { code: 'Z00.00', desc: 'Encounter for general adult medical exam without abnormal findings' },
    { code: 'I10',    desc: 'Essential (primary) hypertension' },
    { code: 'E11.9',  desc: 'Type 2 diabetes mellitus without complications' },
    { code: 'J06.9',  desc: 'Acute upper respiratory infection, unspecified' },
    { code: 'M54.50', desc: 'Low back pain, unspecified' },
    { code: 'F41.9',  desc: 'Anxiety disorder, unspecified' },
    { code: 'R51.9',  desc: 'Headache, unspecified' },
    { code: 'K21.9',  desc: 'Gastro-esophageal reflux disease without esophagitis' },
    { code: 'N39.0',  desc: 'Urinary tract infection, site not specified' },
    { code: 'J45.909',desc: 'Unspecified asthma, uncomplicated' },
    { code: 'E78.5',  desc: 'Hyperlipidemia, unspecified' },
    { code: 'F32.9',  desc: 'Major depressive disorder, single episode, unspecified' },
  ];

  // Common CPT procedure codes (Office E/M and preventive)
  const CPT_CODES = [
    { code: '99213', desc: 'Office visit, established patient, low complexity' },
    { code: '99214', desc: 'Office visit, established patient, moderate complexity' },
    { code: '99203', desc: 'Office visit, new patient, low complexity' },
    { code: '99204', desc: 'Office visit, new patient, moderate complexity' },
    { code: '90471', desc: 'Immunization administration' },
    { code: '36415', desc: 'Routine venipuncture' },
    { code: '93000', desc: 'Electrocardiogram, complete' },
    { code: '85025', desc: 'Complete blood count (CBC), automated' },
  ];
  // Preventive medicine visits — the code depends on the patient's age band.
  const PREVENTIVE_CPT = [
    { code: '99395', desc: 'Periodic preventive medicine, established patient, 18-39 years' },
    { code: '99385', desc: 'Initial preventive medicine, new patient, 18-39 years' },
    { code: '99396', desc: 'Periodic preventive medicine, established patient, 40-64 years' },
    { code: '99386', desc: 'Initial preventive medicine, new patient, 40-64 years' },
    { code: '99397', desc: 'Periodic preventive medicine, established patient, 65+ years' },
    { code: '99387', desc: 'Initial preventive medicine, new patient, 65+ years' },
  ];
  // A child's preventive (well-child) visit: the code depends on the child's age band.
  const PEDS_PREVENTIVE_CPT = [
    { code: '99392', desc: 'Periodic preventive medicine, established patient, 1-4 years', min: 1, max: 4 },
    { code: '99382', desc: 'Initial preventive medicine, new patient, 1-4 years', min: 1, max: 4 },
    { code: '99393', desc: 'Periodic preventive medicine, established patient, 5-11 years', min: 5, max: 11 },
    { code: '99383', desc: 'Initial preventive medicine, new patient, 5-11 years', min: 5, max: 11 },
    { code: '99394', desc: 'Periodic preventive medicine, established patient, 12-17 years', min: 12, max: 17 },
    { code: '99384', desc: 'Initial preventive medicine, new patient, 12-17 years', min: 12, max: 17 },
  ];
  // Medicare pays its own preventive visit: the Annual Wellness Visit (HCPCS codes).
  const MEDICARE_AWV = [
    { code: 'G0439', desc: 'Annual wellness visit, subsequent' },
    { code: 'G0438', desc: 'Annual wellness visit, initial' },
  ];
  // Common reasons a child sees the doctor (ICD-10-CM).
  const PEDS_ICD10_CODES = [
    { code: 'Z00.129', desc: 'Encounter for routine child health examination without abnormal findings' },
    { code: 'J06.9',   desc: 'Acute upper respiratory infection, unspecified' },
    { code: 'H66.90',  desc: 'Otitis media, unspecified, unspecified ear' },
    { code: 'J02.9',   desc: 'Acute pharyngitis, unspecified' },
    { code: 'L20.9',   desc: 'Atopic dermatitis, unspecified' },
    { code: 'J45.909', desc: 'Unspecified asthma, uncomplicated' },
  ];

  const SPECIALTIES = [
    'Family Medicine','Internal Medicine','Pediatrics','Cardiology','Dermatology',
    'Endocrinology','Gastroenterology','Neurology','Obstetrics & Gynecology','Oncology',
    'Ophthalmology','Orthopedics','Psychiatry','Pulmonology','Radiology','Urology',
    'Emergency Medicine','Anesthesiology','Family Practice','General Practice'
  ];

  const PHARMACIES = [
    'CVS Pharmacy','Walgreens','Walmart Pharmacy','Rite Aid','Costco Pharmacy',
    'Kroger Pharmacy','Publix Pharmacy','Target Pharmacy','Sam\'s Club Pharmacy'
  ];

  // Each drug with its own dose, the frequencies it is taken at, its route and its class
  // (two drugs of one class are never listed together).
  const MEDICATIONS = [
    { name: 'Lisinopril 10mg', dose: '10 mg', freq: ['Once daily'], route: 'Oral', cls: 'raas' },
    { name: 'Atorvastatin 20mg', dose: '20 mg', freq: ['Once daily', 'At bedtime'], route: 'Oral', cls: 'statin' },
    { name: 'Metformin 500mg', dose: '500 mg', freq: ['Twice daily', 'Once daily'], route: 'Oral', cls: 'biguanide' },
    { name: 'Levothyroxine 50mcg', dose: '50 mcg', freq: ['Once daily'], route: 'Oral', cls: 'thyroid' },
    { name: 'Amlodipine 5mg', dose: '5 mg', freq: ['Once daily'], route: 'Oral', cls: 'ccb' },
    { name: 'Metoprolol Tartrate 50mg', dose: '50 mg', freq: ['Twice daily'], route: 'Oral', cls: 'beta' },
    { name: 'Albuterol HFA 90mcg', dose: '2 puffs', freq: ['Every 4-6 hours as needed', 'As needed'], route: 'Inhalation', cls: 'saba' },
    { name: 'Omeprazole 20mg', dose: '20 mg', freq: ['Once daily'], route: 'Oral', cls: 'ppi' },
    { name: 'Losartan 50mg', dose: '50 mg', freq: ['Once daily'], route: 'Oral', cls: 'raas' },
    { name: 'Gabapentin 300mg', dose: '300 mg', freq: ['Three times daily', 'At bedtime'], route: 'Oral', cls: 'gabapentinoid' },
    { name: 'Hydrochlorothiazide 25mg', dose: '25 mg', freq: ['Once daily'], route: 'Oral', cls: 'thiazide' },
    { name: 'Sertraline 50mg', dose: '50 mg', freq: ['Once daily'], route: 'Oral', cls: 'ssri' },
    { name: 'Simvastatin 20mg', dose: '20 mg', freq: ['At bedtime', 'Once daily'], route: 'Oral', cls: 'statin' },
    { name: 'Montelukast 10mg', dose: '10 mg', freq: ['Once daily', 'At bedtime'], route: 'Oral', cls: 'ltra' },
    { name: 'Pantoprazole 40mg', dose: '40 mg', freq: ['Once daily'], route: 'Oral', cls: 'ppi' },
    { name: 'Escitalopram 10mg', dose: '10 mg', freq: ['Once daily'], route: 'Oral', cls: 'ssri' },
  ];

  // A child's medicines (children's doses and forms; no two of one class).
  const PEDS_MEDICATIONS = [
    { name: 'Amoxicillin 400mg/5mL suspension', dose: '5 mL', freq: ['Twice daily'], route: 'Oral', cls: 'penicillin' },
    { name: 'Albuterol HFA 90mcg', dose: '2 puffs', freq: ['Every 4-6 hours as needed', 'As needed'], route: 'Inhalation', cls: 'saba' },
    { name: 'Cetirizine 5mg', dose: '5 mg', freq: ['Once daily'], route: 'Oral', cls: 'antihistamine' },
    { name: 'Fluticasone 50mcg nasal spray', dose: '1 spray each nostril', freq: ['Once daily'], route: 'Nasal', cls: 'nasal-steroid', minAge: 4 },
    { name: 'Hydrocortisone 1% cream', dose: 'Thin layer', freq: ['Twice daily'], route: 'Topical', cls: 'topical-steroid' },
  ];

  const ALLERGIES = ['No Known Drug Allergies','Penicillin','Sulfa Drugs','Peanuts','Tree Nuts','Latex','Shellfish','Eggs','Aspirin','Ibuprofen','Codeine'];

  const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

  const RACES = [
    'White','Black or African American','Asian',
    'American Indian or Alaska Native','Native Hawaiian or Other Pacific Islander',
    'Other','Two or More Races','Prefer not to answer'
  ];
  const ETHNICITIES = ['Hispanic or Latino','Not Hispanic or Latino','Prefer not to answer'];

  const MARITAL_STATUS = ['Single','Married','Divorced','Widowed','Separated','Domestic Partnership'];

  const LANGUAGES = ['English','Spanish','Chinese','Tagalog','Vietnamese','Arabic','French','Korean','Russian','German'];

  // The patient's provider / PCP / prescriber: physicians and mid-level practitioners.
  const PROVIDER_TITLES = ['MD','DO','NP','PA'];

  const FACILITIES = [
    'Downtown Medical Center','Northside Family Clinic','Riverside Health Center',
    'Lakeview Primary Care','Westside Specialty Clinic','Central Community Hospital'
  ];
  // Synthetic EIN prefixes (format-valid IRS campus prefixes).
  const EIN_PREFIXES = ['20','21','22','23','24','25','26','27','30','31','32','33','34','35','36','37','38','39'];

  // ---------- helpers ----------
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  // Standard Luhn check digit. Pass the body string; returns the digit
  // that, when appended, makes the total pass Luhn.
  function luhnCheckDigit(body) {
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let d = Number(body[body.length - 1 - i]);
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return (10 - (sum % 10)) % 10;
  }

  // NPI: 10 digits, first digit 1 or 2 (as CMS issues them), last digit a Luhn check
  // on the prefix "80840" + the first 9.
  function generateNPI() {
    let body = String(randInt(1, 2));
    for (let i = 0; i < 8; i++) body += randInt(0, 9);
    return body + luhnCheckDigit('80840' + body);
  }

  // DEA: 2 letters + 7 digits with check digit. The first letter is the registrant type
  // (A / B / F for physicians, M for mid-level practitioners such as NPs and PAs); the
  // second is the initial of the provider's last name.
  // Check digit = (d1 + d3 + d5) + 2*(d2 + d4 + d6) mod 10.
  function generateDEA(lastName, title) {
    const firstLetter = title === 'NP' || title === 'PA' ? 'M' : pick(['A','B','F']);
    const second = String(lastName || 'X').charAt(0).toUpperCase() || 'X';
    const d = [];
    for (let i = 0; i < 6; i++) d.push(randInt(0, 9));
    const check = (d[0] + d[2] + d[4] + 2 * (d[1] + d[3] + d[5])) % 10;
    return `${firstLetter}${second}${d.join('')}${check}`;
  }

  // MRN: 8-10 digit numeric (common pattern across EHRs)
  function generateMRN() {
    const len = randInt(8, 10);
    let s = '';
    for (let i = 0; i < len; i++) s += randInt(0, 9);
    return s;
  }

  // Insurance member ID: 3 letters + 9–11 digits (12–14 chars)
  function generateMemberID(prefix) {
    const p = prefix || pick(['ABC','XYZ','UHC','BCB','AET','CIG','HUM','KAI']);
    let body = '';
    const len = randInt(9, 11);
    for (let i = 0; i < len; i++) body += randInt(0, 9);
    return p + body;
  }

  // Medicare Beneficiary Identifier, CMS format: digit 1-9, letter, letter/digit, digit,
  // letter, letter/digit, digit, letter, letter, digit, digit (no S, L, O, I, B, Z).
  function generateMBI() {
    const L = 'ACDEFGHJKMNPQRTUVWXY';
    const LD = L + '0123456789';
    const p = (s) => s[randInt(0, s.length - 1)];
    return String(randInt(1, 9)) + p(L) + p(LD) + randInt(0, 9) + p(L) + p(LD) + randInt(0, 9) + p(L) + p(L) + randInt(0, 9) + randInt(0, 9);
  }

  // A state Medicaid ID: two letters and eight digits.
  function generateMedicaidId() {
    const L = 'ACDEFGHJKMNPQRTUVWXY';
    let s = L[randInt(0, L.length - 1)] + L[randInt(0, L.length - 1)];
    for (let i = 0; i < 8; i++) s += randInt(0, 9);
    return s;
  }

  function generateGroupNumber() {
    let s = '';
    const len = randInt(5, 7);
    for (let i = 0; i < len; i++) s += randInt(0, 9);
    return s;
  }

  function generatePolicyNumber() {
    const pre = String.fromCharCode(65 + randInt(0, 25)) + String.fromCharCode(65 + randInt(0, 25));
    let body = '';
    for (let i = 0; i < 8; i++) body += randInt(0, 9);
    return pre + body;
  }

  // Generic US outpatient / long-term-care note sentences for comment and notes fields
  // (no names, nothing about the tool). Notes are built from several of them.
  const CLINICAL_NOTES = [
    'Patient seen for routine follow-up. Vitals stable, no acute distress. Continue current medications.',
    'Medication list and allergies reviewed with the patient. No changes at this time.',
    'Patient reports feeling well. Denies chest pain, shortness of breath or fever.',
    'Preventive screenings discussed and scheduled as appropriate.',
    'Blood pressure within normal limits. Encouraged regular physical activity and a balanced diet.',
    'Follow up in 3 months, or sooner if symptoms change or worsen.',
    'Insurance verified at check-in. Patient informed of copay responsibility.',
    'Care plan reviewed with the patient and family; all questions answered.',
    'Fall risk assessment completed; no new concerns noted.',
    'Patient has requested appointment reminder calls.',
    'Immunization record reviewed and updated. No vaccines due at this visit.',
    'Diet and fluid intake adequate. Continue current activities of daily living support.',
    'Sleep pattern reported as regular, averaging seven to eight hours per night.',
    'Pain assessed using a numeric scale; patient rates current pain as mild and well controlled.',
    'Skin intact with no redness, bruising or pressure areas observed during the assessment.',
    'Patient ambulates independently with a steady gait and does not require an assistive device today.',
    'Cognition appears at baseline. Patient is alert and oriented to person, place and time.',
    'Advance directive status confirmed and a copy is on file in the medical record.',
    'Education provided on medication timing, possible side effects and when to call the clinic.',
    'Patient verbalized understanding of the instructions and agreed with the plan of care.',
    'Recent laboratory results reviewed and discussed; values are within expected ranges.',
    'No new allergies reported. Allergy list confirmed as current.',
    'Hydration encouraged, with a goal of six to eight glasses of water daily unless otherwise directed.',
    'Emergency contact information verified and updated in the chart.',
  ];

  // A note of at least `minWords` words, from shuffled sentences (each fill differs).
  const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
  function clinicalNote(minWords = 100) {
    const pool = shuffle(CLINICAL_NOTES.slice());
    const out = [];
    for (let i = 0; wordCount(out.join(' ')) < minWords; i++) out.push(pool[i % pool.length]);
    return out.join(' ');
  }

  // US time zones: IANA id + the names time-zone pickers commonly show.
  const TIME_ZONES = {
    ET: { id: 'America/New_York', names: ['Eastern Time (US & Canada)', 'Eastern Standard Time', 'US/Eastern', 'Eastern', 'EST', 'ET'] },
    CT: { id: 'America/Chicago', names: ['Central Time (US & Canada)', 'Central Standard Time', 'US/Central', 'Central', 'CST', 'CT'] },
    MT: { id: 'America/Denver', names: ['Mountain Time (US & Canada)', 'Mountain Standard Time', 'US/Mountain', 'Mountain', 'MST', 'MT'] },
    AZ: { id: 'America/Phoenix', names: ['Arizona', 'US/Arizona', 'Mountain Standard Time', 'Mountain', 'MST'] },
    PT: { id: 'America/Los_Angeles', names: ['Pacific Time (US & Canada)', 'Pacific Standard Time', 'US/Pacific', 'Pacific', 'PST', 'PT'] },
    IN: { id: 'America/Indiana/Indianapolis', names: ['Indiana (East)', 'US/East-Indiana', 'Eastern Time (US & Canada)', 'Eastern', 'EST'] },
  };

  // Phone in the NANP range reserved for fiction: <real area code>-555-01XX.
  // Structurally valid (passes libphonenumber-style validators) yet never assigned.
  function fictionalPhone(area) {
    const line = `01${pad(randInt(0, 99))}`;
    return {
      digits: `${area}555${line}`,
      dashed: `${area}-555-${line}`,
      formatted: `(${area}) 555-${line}`,
      intl: `+1 ${area}-555-${line}`,
    };
  }

  // Whole years between dob and now (accounts for birthdays not yet reached).
  function ageOn(dob, now) {
    let age = now.getFullYear() - dob.getFullYear();
    const hadBirthday = now.getMonth() > dob.getMonth() ||
      (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
    if (!hadBirthday) age--;
    return age;
  }

  // ---------- valid generator ----------
  // One consistent person: every value agrees with the others (address / phone / time
  // zone, age / DOB, subscriber / relationship / marital status, drug / dose / frequency,
  // carrier / plan / member ID, provider title / specialty / DEA, diagnosis / visit reason).
  const VACCINES = ['Influenza (flu)', 'Tdap', 'COVID-19', 'Hepatitis B', 'Pneumococcal (PCV20)', 'Shingles (Shingrix)', 'MMR'];
  // Vaccines that fit a child (up to 10), a teenager (11-17) and a senior (65+).
  const CHILD_VACCINES = ['Influenza (flu)', 'DTaP', 'MMR', 'Varicella', 'Hepatitis A', 'Polio (IPV)'];
  const TEEN_VACCINES = ['Influenza (flu)', 'Tdap', 'HPV', 'Meningococcal (MenACWY)', 'COVID-19'];
  const SENIOR_VACCINES = ['Influenza (flu)', 'Pneumococcal (PCV20)', 'Shingles (Shingrix)', 'COVID-19', 'Tdap', 'RSV'];
  const lotNumber = () => pick(['FL', 'EK', 'TD', 'HB', 'PN']) + randInt(1000, 9999) + pick(['A', 'B', 'C', 'X']);
  // Why the patient comes in, per diagnosis.
  const VISIT_BY_ICD = {
    'Z00.00': { reason: 'Annual physical exam', complaint: 'Annual physical exam', symptoms: 'No acute symptoms' },
    'I10': { reason: 'Blood pressure follow-up', complaint: 'Follow-up for high blood pressure', symptoms: 'Occasional mild headaches' },
    'E11.9': { reason: 'Diabetes follow-up', complaint: 'Follow-up for type 2 diabetes', symptoms: 'Increased thirst and fatigue' },
    'J06.9': { reason: 'Cold symptoms', complaint: 'Sore throat and runny nose for 3 days', symptoms: 'Sore throat, nasal congestion, mild cough' },
    'M54.50': { reason: 'Low back pain', complaint: 'Low back pain for 2 weeks', symptoms: 'Low back pain, worse when bending' },
    'F41.9': { reason: 'Anxiety follow-up', complaint: 'Feeling anxious and restless', symptoms: 'Restlessness, trouble sleeping' },
    'R51.9': { reason: 'Headache', complaint: 'Headaches for one week', symptoms: 'Headache, sensitivity to light' },
    'K21.9': { reason: 'Heartburn', complaint: 'Heartburn after meals', symptoms: 'Heartburn, acid taste after meals' },
    'N39.0': { reason: 'Urinary symptoms', complaint: 'Burning with urination for 2 days', symptoms: 'Burning with urination, urinary frequency' },
    'J45.909': { reason: 'Asthma follow-up', complaint: 'Wheezing with exercise', symptoms: 'Wheezing, shortness of breath with exertion' },
    'E78.5': { reason: 'Cholesterol follow-up', complaint: 'Follow-up for high cholesterol', symptoms: 'No acute symptoms' },
    'F32.9': { reason: 'Depression follow-up', complaint: 'Low mood for several weeks', symptoms: 'Low mood, low energy, poor sleep' },
    'Z00.129': { reason: 'Well-child visit', complaint: 'Well-child check-up', symptoms: 'No acute symptoms' },
    'H66.90': { reason: 'Ear pain', complaint: 'Ear pain and fever for 2 days', symptoms: 'Ear pain, fever, trouble sleeping' },
    'J02.9': { reason: 'Sore throat', complaint: 'Sore throat for 2 days', symptoms: 'Sore throat, pain when swallowing, mild fever' },
    'L20.9': { reason: 'Eczema follow-up', complaint: 'Itchy, dry patches of skin', symptoms: 'Dry, itchy skin on the arms and behind the knees' },
  };

  // Who to make (Settings → Test patient): an age band, the kind of insurance and a state.
  // No profile — or Adult / Any / Any, the defaults — makes the person exactly as before.
  const pickWeighted = (pairs) => {
    let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0);
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  function resolveProfile(p) {
    p = p || {};
    const patient = ['any', 'child', 'adult', 'senior'].includes(p.patient) ? p.patient : 'adult';
    const insurance = ['any', 'private', 'medicare', 'medicaid', 'none'].includes(p.insurance) ? p.insurance : 'any';
    const state = LOCATIONS.some((l) => l.state === p.state) ? p.state : 'any';
    // Medicare is for people of 65 and over (the Settings page offers it only with Any / Senior).
    let band = patient === 'any' ? pickWeighted([['child', 20], ['adult', 55], ['senior', 25]]) : patient;
    if (insurance === 'medicare') band = 'senior';
    return { band, insurance, state };
  }

  function generateValid(profile) {
    const prof = resolveProfile(profile);
    const child = prof.band === 'child';
    const senior = prof.band === 'senior';
    const isMale = Math.random() < 0.5;
    const ownNames = isMale ? FIRST_NAMES_M : FIRST_NAMES_F;
    const otherNames = isMale ? FIRST_NAMES_F : FIRST_NAMES_M;
    const firstName = pick(ownNames);
    const lastName = pick(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    const middleName = pick(ownNames.filter((n) => n !== firstName)); // same gender as the first name
    const middleInitial = middleName.charAt(0); // matches the middle name

    const loc = pick(prof.state === 'any' ? LOCATIONS : LOCATIONS.filter((l) => l.state === prof.state));
    const stateInfo = STATES.find(s => s.code === loc.state) || { name: 'New York', code: 'NY' };
    // The county each city lies in (New York = Manhattan, the 10001 ZIP).
    const COUNTY_BY_CITY = {
      'New York': 'New York County', 'Los Angeles': 'Los Angeles County', Chicago: 'Cook County', Houston: 'Harris County',
      Phoenix: 'Maricopa County', Philadelphia: 'Philadelphia County', 'San Antonio': 'Bexar County', 'San Diego': 'San Diego County',
      Dallas: 'Dallas County', 'San Jose': 'Santa Clara County', Austin: 'Travis County', Jacksonville: 'Duval County',
      'Fort Worth': 'Tarrant County', Columbus: 'Franklin County', Charlotte: 'Mecklenburg County', Indianapolis: 'Marion County',
      Seattle: 'King County', Denver: 'Denver County', Boston: 'Suffolk County', Nashville: 'Davidson County',
      Portland: 'Multnomah County', Atlanta: 'Fulton County', Miami: 'Miami-Dade County', Minneapolis: 'Hennepin County',
      Cleveland: 'Cuyahoga County',
    };
    const streetNum = randInt(100, 9999);
    const streetName = pick(STREET_NAMES);
    const streetType = pick(STREET_TYPES);
    const address1 = `${streetNum} ${streetName} ${streetType}`;
    const address2 = `Apt ${randInt(1, 500)}`;

    const username = (firstName + lastName + randInt(10, 999)).toLowerCase();
    // Mailinator addresses go to a public inbox at https://www.mailinator.com/v4/public/inboxes.jsp?to=<local-part>
    // We include a 4-digit suffix so two QA runs don't collide in the same inbox.
    const emailLocal = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${randInt(1000, 9999)}`;
    const email = `${emailLocal}@mailinator.com`;

    // Phones: fictional 555-01XX range on the city's real area code; dashed by default.
    // The emergency contact's and the fax number are always different numbers.
    const ph = fictionalPhone(loc.area);
    const phone10 = ph.digits;
    const phoneDashed = ph.dashed;
    const phoneFormatted = ph.formatted;
    const phoneIntl = ph.intl;
    const otherPhone = (...taken) => { let p; do { p = fictionalPhone(loc.area).dashed; } while (taken.includes(p)); return p; };
    const ecPhone = otherPhone(phoneDashed);
    const faxPhone = otherPhone(phoneDashed, ecPhone);
    const workPhone = otherPhone(phoneDashed, ecPhone, faxPhone); // the employer's number
    // A home landline and a second ("secondary / alternate") number of their own: a form that asks
    // for several numbers gets different ones (the primary one is the mobile).
    const homePhone = otherPhone(phoneDashed, ecPhone, faxPhone, workPhone);
    const altPhone = otherPhone(phoneDashed, ecPhone, faxPhone, workPhone, homePhone);

    // Dates are counted in calendar days (not 24-hour steps, which slip across DST).
    const now = new Date();
    const dayOffset = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    const us = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // DOB: an adult is 22–65 years old, a child 2–17, a senior 65–90; age is derived from the
    // DOB so the two always agree. (Born N years ago is age N or N−1 depending on the
    // birthday, hence 23–65 / 3–17 / 66–90.)
    const yearsAgo = child ? randInt(3, 17) : senior ? randInt(66, 90) : randInt(23, 65);
    const dob = new Date(now.getFullYear() - yearsAgo, randInt(0, 11), randInt(1, 28));
    const ageYears = ageOn(dob, now);

    // SSN: area 9XX is never issued as an SSN; group 10–49 is also outside the IRS ITIN
    // (50–65, 70–88, 90–92, 94–99) and ATIN (93) ranges, so it is nobody's number.
    const ssn = `9${randInt(10, 99)}-${pad(randInt(10, 49))}-${pad(randInt(1000, 9999), 4)}`;

    const cc = pick(TEST_CC);
    const ccExpMonth = pad(randInt(1, 12));
    const ccExpYear = String(now.getFullYear() + randInt(1, 5));
    const ccExp = `${ccExpMonth}/${ccExpYear.slice(2)}`;

    // One known password for every test account (Settings can change it). Meets the usual
    // rules: upper + lower case, a digit, a symbol, 10 characters.
    const password = 'Admin@1234';
    // A random strong one, for "Password for test accounts" left empty.
    const passwordRandom = `Test@${randInt(1000, 9999)}!Aa`;

    // Carrier, plan type, plan name and member-ID prefix belong together; Medicare only 65+.
    // An adult with "Any" insurance gets exactly what FillCraft always gave. Otherwise the
    // kind asked for: a child is on a parent's private plan or on Medicaid / CHIP; a senior
    // mostly on Medicare (Original or Medicare Advantage); "None" is a self-pay patient.
    const isMedicaid = (t) => /medicaid/i.test(t);
    const wanted = prof.insurance !== 'any' ? prof.insurance
      : child ? pickWeighted([['private', 60], ['medicaid', 40]])
      : senior ? pickWeighted([['medicare', 85], ['private', 15]])
      : 'asBefore';
    let carrier = null;
    let insuranceType = 'Self-pay';
    if (wanted === 'asBefore') {
      const carriers = CARRIERS.filter((c) => ageYears >= 65 || c.types.some((t) => !MEDICARE_TYPES.includes(t)));
      carrier = pick(carriers);
      insuranceType = pick(carrier.types.filter((t) => ageYears >= 65 || !MEDICARE_TYPES.includes(t)));
    } else if (wanted === 'medicare') {
      // Half on Original Medicare, half on a Medicare Advantage plan.
      carrier = Math.random() < 0.5 ? CARRIERS.find((c) => c.name === 'Medicare') : pick(CARRIERS.filter((c) => c.types.includes('Medicare Advantage')));
      insuranceType = carrier.name === 'Medicare' ? 'Medicare' : 'Medicare Advantage';
    } else if (wanted !== 'none') {
      const fits = wanted === 'medicaid' ? isMedicaid : (t) => !MEDICARE_TYPES.includes(t) && !isMedicaid(t);
      carrier = pick(CARRIERS.filter((c) => c.types.some(fits)));
      insuranceType = pick(carrier.types.filter(fits));
    }
    const selfPay = !carrier;
    const onMedicare = !selfPay && MEDICARE_TYPES.includes(insuranceType);
    const onMedicaid = !selfPay && isMedicaid(insuranceType);
    // (A self-pay patient has no plan: those fields are left empty on purpose.)
    const planName = selfPay ? '' : pick((carrier.plans && carrier.plans[insuranceType]) || PLAN_NAMES_BY_TYPE[insuranceType]);
    const insuranceCarrier = selfPay ? '' : carrier.name;
    // Medicare's own ID (on the red-white-and-blue card); on Original Medicare it is also the
    // member ID. Medicaid's state ID for "Medicaid ID" fields.
    const mbi = onMedicare ? generateMBI() : undefined;
    const medicaidId = onMedicaid ? generateMedicaidId() : undefined;
    const memberId = selfPay ? '' : insuranceType === 'Medicare' ? mbi : generateMemberID(carrier.prefix);
    const groupNumber = selfPay ? '' : generateGroupNumber();
    const policyNumber = selfPay ? '' : generatePolicyNumber();

    // Family: the insurance subscriber is the patient ("Self"), the spouse, or — for a
    // patient of 26 or younger — a parent; the spouse is the same person everywhere.
    // Medicare and Medicaid cover each person on their own: the subscriber is the patient.
    // A child on a private plan is on a parent's plan; a self-pay patient has no subscriber.
    const ownCoverage = onMedicare || onMedicaid;
    const relationshipToSubscriber = selfPay ? '' : ownCoverage ? 'Self' : child ? 'Child'
      : ageYears <= 26 ? pick(['Self', 'Spouse', 'Child']) : pick(['Self', 'Spouse']);
    const maritalStatus = child ? 'Single' : relationshipToSubscriber === 'Spouse' ? 'Married' : pick(MARITAL_STATUS);
    const hasSpouse = maritalStatus === 'Married' || maritalStatus === 'Domestic Partnership';
    const spouseFirst = pick(otherNames);
    const parentFirst = pick([...FIRST_NAMES_M, ...FIRST_NAMES_F].filter((n) => n !== firstName));
    let subscriberFirst = firstName;
    let subscriberDob = dob;
    if (relationshipToSubscriber === 'Spouse') {
      subscriberFirst = spouseFirst;
      subscriberDob = new Date(dob.getFullYear() + randInt(-5, 5), randInt(0, 11), randInt(1, 28));
      if (ageOn(subscriberDob, now) < 21) subscriberDob = new Date(now.getFullYear() - 25, subscriberDob.getMonth(), subscriberDob.getDate());
    } else if (relationshipToSubscriber === 'Child') {
      subscriberFirst = parentFirst;
      subscriberDob = new Date(dob.getFullYear() - randInt(22, 35), randInt(0, 11), randInt(1, 28));
    }
    // (The subscriber shares the patient's last name: self, spouse or parent.)
    const subscriberName = selfPay ? '' : `${subscriberFirst} ${lastName}`;
    // Emergency contact: the spouse when there is one (often), else a parent (for a patient
    // under 60), sibling, friend, or — for a patient of 38+ — a grown child. Never the
    // patient's own name. A child's is their parent (also their guardian).
    const parentOk = ageYears < 60;
    const parentIsMother = FIRST_NAMES_F.includes(parentFirst);
    const ecRelationship = child ? (parentIsMother ? 'Mother' : 'Father')
      : hasSpouse ? pick(['Spouse', 'Spouse', parentOk ? 'Parent' : 'Child', 'Sibling'])
      : pick([...(parentOk ? ['Parent'] : []), 'Sibling', 'Friend', ...(ageYears >= 38 ? ['Child'] : [])]);
    const ecFirst = child ? parentFirst : ecRelationship === 'Spouse' ? spouseFirst
      : pick([...FIRST_NAMES_M, ...FIRST_NAMES_F].filter((n) => n !== firstName && n !== spouseFirst));
    const ecLast = ecRelationship === 'Friend' ? pick(LAST_NAMES.filter((n) => n !== lastName)) : lastName;

    const language = Math.random() < 0.7 ? 'English' : pick(LANGUAGES.filter((l) => l !== 'English'));

    // Healthcare-specific
    const npi = generateNPI();
    const mrn = generateMRN();
    // Pharmacy benefit: the carrier's own BIN where it is published (Aetna; Humana's Part D;
    // UnitedHealthcare / OptumRx), otherwise one of the big PBMs (Express Scripts, CVS Caremark).
    // (Self-pay: no pharmacy plan. Original Medicare has no drug coverage of its own.)
    const rxBinPcn = selfPay || insuranceType === 'Medicare' ? { bin: '', pcn: '', none: true }
      : carrier.name === 'Aetna' ? { bin: '610502' }
      : carrier.name === 'Humana' && insuranceType === 'Medicare Advantage' ? { bin: '015581', pcn: '03200000' }
      : carrier.name === 'UnitedHealthcare' ? { bin: '610279' }
      : { bin: pick(['610014', '003858', '004336']) };

    // Diagnosis → visit reason, appointment type and procedure code (a child's own
    // diagnoses and well-child visit codes; Medicare's Annual Wellness Visit for its patients).
    const icd = pick(child ? PEDS_ICD10_CODES : ICD10_CODES);
    const visit = VISIT_BY_ICD[icd.code] || VISIT_BY_ICD['Z00.00'];
    const preventive = icd.code === 'Z00.00' || icd.code === 'Z00.129';
    const appointmentType = preventive ? 'Annual Physical' : pick(['Follow-up', 'New Patient', 'Telehealth', 'Consultation']);
    const prevBand = ageYears >= 65 ? ['99397', '99387'] : ageYears >= 40 ? ['99396', '99386'] : ['99395', '99385'];
    const cptPool = preventive
      ? (child ? PEDS_PREVENTIVE_CPT.filter((c) => ageYears >= c.min && ageYears <= c.max)
        : senior && onMedicare ? MEDICARE_AWV
        : PREVENTIVE_CPT.filter((c) => prevBand.includes(c.code)))
      : CPT_CODES.filter((c) => (appointmentType === 'New Patient' ? ['99203', '99204'] : ['99213', '99214']).includes(c.code));
    const cpt = pick(cptPool);

    // The patient's provider prescribes: MD / DO / NP / PA, with a specialty that fits an
    // adult patient (no pediatrics; OB/GYN only for women) and the DEA registrant letter of
    // the title (A/B/F for physicians, M for mid-level practitioners). A child sees a
    // pediatrician or a family doctor.
    // (The title is also this person's own when a form is about them as a provider — the DEA
    // below — so no MD / DO before 27: medical school ends at about 26. A child is never the
    // provider being entered, so any title.)
    const providerTitle = pick(ageYears >= 27 || child ? PROVIDER_TITLES : PROVIDER_TITLES.filter((t) => t === 'NP' || t === 'PA'));
    const specialty = child ? pick(['Pediatrics', 'Pediatrics', 'Family Medicine'])
      : pick(SPECIALTIES.filter((s) => s !== 'Pediatrics' && (isMale ? s !== 'Obstetrics & Gynecology' : true)));
    const providerLast = pick(LAST_NAMES);
    const providerIsDoctor = providerTitle === 'MD' || providerTitle === 'DO';
    const providerName = `${providerIsDoctor ? 'Dr. ' : ''}${pick([...FIRST_NAMES_M, ...FIRST_NAMES_F])} ${providerLast}, ${providerTitle}`;
    // A form with a DEA number is almost always about the provider being entered (the
    // person this dataset describes): their DEA's second letter is their own last name's.
    // The patient's provider keeps one of their own (providerDea).
    const dea = generateDEA(lastName, providerTitle);
    const providerDea = generateDEA(providerLast, providerTitle);
    // Credentials that fit the title: NUCC taxonomy code, license name, a clinical bio.
    const TAXONOMY_BY_SPECIALTY = {
      'Family Medicine': '207Q00000X', 'Family Practice': '207Q00000X', 'Internal Medicine': '207R00000X', 'Pediatrics': '208000000X',
      'Cardiology': '207RC0000X', 'Dermatology': '207N00000X', 'Endocrinology': '207RE0101X', 'Gastroenterology': '207RG0100X',
      'Neurology': '2084N0400X', 'Obstetrics & Gynecology': '207V00000X', 'Oncology': '207RX0202X', 'Ophthalmology': '207W00000X',
      'Orthopedics': '207X00000X', 'Psychiatry': '2084P0800X', 'Pulmonology': '207RP1001X', 'Radiology': '2085R0202X',
      'Urology': '208800000X', 'Emergency Medicine': '207P00000X', 'Anesthesiology': '207L00000X', 'General Practice': '208D00000X',
    };
    // A nurse practitioner's NUCC code follows the field they work in: family, psychiatric /
    // mental health, women's health, acute care, or adult health for the adult specialties.
    const npTaxonomy = specialty === 'Pediatrics' ? '363LP0200X' : /Family|General Practice/.test(specialty) ? '363LF0000X' : specialty === 'Psychiatry' ? '363LP0808X'
      : specialty === 'Obstetrics & Gynecology' ? '363LW0102X' : /Emergency|Anesthesiology/.test(specialty) ? '363LA2100X' : '363LA2200X';
    const taxonomyCode = providerTitle === 'NP' ? npTaxonomy : providerTitle === 'PA' ? '363A00000X' : (TAXONOMY_BY_SPECIALTY[specialty] || '207Q00000X');
    const titleLong = { MD: 'physician (MD)', DO: 'physician (DO)', NP: 'nurse practitioner', PA: 'physician assistant' }[providerTitle];
    const licenseName = { MD: 'Medical License', DO: 'Osteopathic Medical License', NP: 'Nurse Practitioner License', PA: 'Physician Assistant License' }[providerTitle];

    // Vitals — realistic adult ranges by sex; weight from a healthy-to-overweight BMI.
    // A child's grow with age (height about 35 in at 2, 55 in at 10; teens toward adult
    // height) with a child's BMI, heart rate, breathing rate and blood pressure.
    let heightInches;
    let weightLb;
    let bpSys;
    let bpDia;
    let heartRate;
    let respRate;
    if (child) {
      const teen = Math.max(0, ageYears - 12);
      const base = ageYears <= 12 ? 30 + 2.5 * ageYears : 60 + teen * (isMale ? 1.8 : 0.9);
      heightInches = Math.round(base + randInt(-2, 2));
      const bmi = (ageYears <= 10 ? 15.5 : 15.5 + (ageYears - 10) * 0.7) + randInt(-10, 15) / 10;
      weightLb = Math.round(bmi * heightInches * heightInches / 703);
      if (ageYears <= 5) { heartRate = randInt(80, 120); respRate = randInt(20, 30); bpSys = randInt(90, 105); bpDia = randInt(55, 65); }
      else if (ageYears <= 12) { heartRate = randInt(70, 110); respRate = randInt(18, 25); bpSys = randInt(95, 110); bpDia = randInt(58, 72); }
      else { heartRate = randInt(60, 100); respRate = randInt(12, 20); bpSys = randInt(105, 119); bpDia = randInt(65, 79); }
    } else {
      heightInches = isMale ? randInt(64, 76) : randInt(59, 69);
      weightLb = Math.round((randInt(190, 320) / 10) * heightInches * heightInches / 703); // BMI 19–32
      bpSys = randInt(108, 119); // normal range (the notes say "within normal limits")
      bpDia = randInt(68, 79);
      heartRate = randInt(60, 90);
      respRate = randInt(12, 18);
    }
    const heightFt = Math.floor(heightInches / 12);
    const heightIn = heightInches % 12;
    const heightCm = Math.round(heightInches * 2.54);
    const weightKg = Math.round(weightLb * 0.4536);
    const tempF = (97 + Math.random() * 2.5).toFixed(1);
    const tempC = ((Number(tempF) - 32) * 5 / 9).toFixed(1);
    const oxygenSat = randInt(96, 100);

    // Date of service: a past visit, 1–30 days ago.
    const dosDate = dayOffset(-randInt(1, 30));
    const dos = us(dosDate);
    // Two different generic clinical notes (no names, nothing about the tool that wrote them).
    const noteA = clinicalNote(100);
    let noteB = clinicalNote(100);
    if (noteB === noteA) noteB = clinicalNote(100);
    // Admission / check-in: today (check-in pickers often refuse past or future dates —
    // today passes both); the referral came 1–14 days before it.
    const admitDate = dayOffset(0);
    const referralDate = dayOffset(-randInt(1, 14));

    // Insurance coverage: starts on the 1st of a month 1–10 months ago and runs one year,
    // so it is always active today (also on the last day of a month).
    const effDate = new Date(now.getFullYear(), now.getMonth() - randInt(1, 10), 1);
    const termDate = new Date(effDate.getFullYear() + 1, effDate.getMonth(), 0);

    // Appointment: a weekday 1–30 days ahead, 15-minute slot between 8:00 and 16:30.
    // (Re-draw on a weekend instead of pushing forward, which could pass 30 days.)
    let apptDate;
    do {
      apptDate = dayOffset(randInt(1, 30));
    } while (apptDate.getDay() === 0 || apptDate.getDay() === 6);
    const slot = randInt(32, 66); // quarter-hours since midnight: 8:00 … 16:30
    const apptH = Math.floor(slot / 4);
    const apptM = pad((slot % 4) * 15);
    const appointmentTime = `${((apptH + 11) % 12) + 1}:${apptM} ${apptH < 12 ? 'AM' : 'PM'}`;

    // Medications: two drugs of different classes, each with its own dose / frequency /
    // route; repeated medication rows get further drugs (again no class twice).
    // (A child gets children's medicines: none they are allergic to, none too young for.)
    const allergy = pick(ALLERGIES);
    const meds = [];
    for (const m of shuffle(child ? PEDS_MEDICATIONS : MEDICATIONS)) {
      if (meds.some((x) => x.cls === m.cls)) continue;
      if (allergy === 'Sulfa Drugs' && m.cls === 'thiazide') continue; // hydrochlorothiazide is a sulfonamide
      if (allergy === 'Penicillin' && m.cls === 'penicillin') continue; // amoxicillin is a penicillin
      if (m.minAge && ageYears < m.minAge) continue;
      meds.push(m);
    }
    const [med1, med2] = meds;
    const moreMeds = meds.slice(1, 5);
    // A child is a student, a senior retired (no employer, pay or hours of their own).
    const jobTitle = child ? 'Student' : senior ? 'Retired' : pick(JOB_TITLES);
    const vaccinePool = child ? (ageYears >= 11 ? TEEN_VACCINES : CHILD_VACCINES) : senior ? SENIOR_VACCINES : VACCINES;
    const vaccine = pick(vaccinePool);

    return {
      // ---- identity ----
      firstName, lastName, fullName, middleName, middleInitial,
      phoneticName: `${firstName} ${lastName}`,
      maidenName: pick(LAST_NAMES.filter((n) => n !== lastName)),
      // Prefix, suffix and pronouns agree with the patient's gender.
      // ("Dr." now and then; "Mrs." only when married; "Sr." only for an older man.)
      // (A child has no title: left empty on purpose.)
      prefix: child ? '' : Math.random() < 0.05 ? 'Dr.' : isMale ? 'Mr.' : maritalStatus === 'Married' ? pick(['Mrs.', 'Mrs.', 'Ms.']) : 'Ms.',
      suffix: isMale ? pick(['', '', '', '', 'Jr.', 'III', ...(ageYears >= 45 ? ['Sr.'] : [])]) : '',
      gender: isMale ? 'Male' : 'Female',
      genderShort: isMale ? 'M' : 'F',
      sex: isMale ? 'Male' : 'Female',
      pronouns: isMale ? pick(['He/Him', 'He/Him', 'He/They']) : pick(['She/Her', 'She/Her', 'She/They']),

      // ---- credentials ----
      username, email,
      emailAlt: email,
      emailConfirm: email,
      verifyEmail: email,
      mailinatorInbox: `https://www.mailinator.com/v4/public/inboxes.jsp?to=${emailLocal}`,
      password,
      passwordConfirm: password,
      passwordRandom,

      // ---- phones ----
      phone: phoneDashed,
      phoneFormatted,
      phoneDigits: phone10,
      phoneDashed,
      phoneIntl,
      phoneAreaCode: loc.area,
      mobile: phoneDashed,
      homePhone,
      altPhone,
      workPhone,
      phoneExt: String(randInt(101, 4999)),
      fax: faxPhone,

      // ---- address ----
      address1, address2,
      streetNumber: String(streetNum),
      streetName: `${streetName} ${streetType}`,
      city: loc.city,
      county: COUNTY_BY_CITY[loc.city] || '',
      state: stateInfo.code,
      stateCode: stateInfo.code,
      stateName: stateInfo.name,
      zip: loc.zip,
      zip4: `${loc.zip}-${pad(randInt(1, 9999), 4)}`,
      timeZone: TIME_ZONES[loc.tz].id,
      timeZoneNames: TIME_ZONES[loc.tz].names,
      country: 'United States',
      countryCode: 'US',

      // ---- demographics ----
      dob: iso(dob),
      dobUS: us(dob),
      age: String(ageYears),
      ssn,
      ssnLast4: ssn.slice(-4),
      race: pick(RACES),
      ethnicity: pick(ETHNICITIES),
      maritalStatus,
      language,
      preferredLanguage: language,

      // ---- employment ----
      // (A child or a retired senior has no employer, hours, pay or supervisor: those fields
      // are left empty on purpose; their occupation is "Student" / "Retired".)
      company: child || senior ? '' : pick(COMPANIES),
      jobTitle,
      // Working since 22 at the earliest; full- or part-time hours; pay in a normal range.
      yearsExperience: child ? '' : String(randInt(1, Math.max(1, Math.min(35, ageYears - 22)))),
      hoursPerWeek: child || senior ? '' : String(pick([40, 40, 40, 36, 32, 30, 24, 20])),
      salary: child || senior ? '' : String(randInt(84, 236) * 500),
      hourlyRate: child || senior ? '' : `${randInt(18, 58)}.${pick(['00', '25', '50', '75'])}`,
      supervisorName: child || senior ? '' : `${pick(FIRST_NAMES_F.concat(FIRST_NAMES_M))} ${pick(LAST_NAMES.filter((n) => n !== lastName))}`,
      initials: `${firstName.charAt(0)}${middleInitial}${lastName.charAt(0)}`,
      website: `https://${lastName.toLowerCase()}.example.com`,
      url: `https://www.example.com/${username}`,

      // ---- payment (test PANs) ----
      ccNumber: cc.number,
      ccCvv: cc.cvv,
      ccExp,
      ccExpMonth,
      ccExpYear,
      ccExpYearShort: ccExpYear.slice(2),
      // (A child's card is the parent's.)
      ccName: child ? `${parentFirst} ${lastName}` : fullName,
      ccBrand: cc.brand,

      // ---- healthcare: identifiers ----
      npi,
      mrn,
      patientId: mrn,
      memberId,
      subscriberId: memberId,
      insuranceId: memberId,
      groupNumber,
      // Pharmacy benefit (Rx) identifiers on insurance cards.
      rxBin: rxBinPcn.bin,
      rxPcn: rxBinPcn.none ? '' : rxBinPcn.pcn || pick(['ADV', 'CTRX', 'A4', 'PCS', '9999']),
      rxGroup: rxBinPcn.none ? '' : 'RX' + randInt(1000, 9999),
      copay: selfPay ? '' : pick(['20.00', '25.00', '30.00', '35.00', '40.00', '50.00']),
      // Medicare's and Medicaid's own IDs, for "Medicare ID / MBI" and "Medicaid ID" fields.
      ...(mbi ? { mbi } : {}),
      ...(medicaidId ? { medicaidId } : {}),
      vaccineName: vaccine,
      lotNumber: lotNumber(),
      medicationDose: med1.dose,
      medicationFrequency: pick(med1.freq),
      medicationRoute: med1.route,
      // Values for the 2nd, 3rd… row of a repeated section (never the first row's value;
      // a medication row's drug, dose, frequency and route stay together).
      alternates: {
        vaccineName: shuffle(vaccinePool.filter((x) => x !== vaccine)),
        lotNumber: [0, 1, 2, 3].map(() => lotNumber()),
        medication: moreMeds.map((m) => m.name),
        medicationDose: moreMeds.map((m) => m.dose),
        medicationFrequency: moreMeds.map((m) => pick(m.freq)),
        medicationRoute: moreMeds.map((m) => m.route),
      },
      policyNumber,
      dea,

      // ---- healthcare: insurance ----
      insuranceCarrier,
      insuranceCompany: insuranceCarrier,
      insuranceProvider: insuranceCarrier,
      insurancePlan: planName,
      planName,
      insuranceType,
      // What insurance-type lists that sort by kind call it ("Commercial / Medicare / Medicaid /
      // Self-Pay" — not "HMO / PPO"), after the plan type itself.
      insuranceTypeHints: selfPay ? ['Self-pay', 'Self Pay', 'Uninsured', 'Cash', 'No Insurance']
        : insuranceType === 'Medicare' ? ['Original Medicare', 'Medicare', 'Medicare Part A & B']
        : insuranceType === 'Medicare Advantage' ? ['Medicare Advantage', 'Medicare Part C', 'Medicare']
        : onMedicaid ? (child ? ['Medicaid', 'CHIP', 'Medicaid Managed Care'] : ['Medicaid', 'Medicaid Managed Care'])
        : ['Commercial', 'Private', 'Private Insurance', 'Employer'],

      // ---- healthcare: clinical ----
      icd10: icd.code,
      icd10Desc: icd.desc,
      diagnosis: icd.desc,
      diagnosisCode: icd.code,
      cpt: cpt.code,
      cptDesc: cpt.desc,
      procedureCode: cpt.code,
      specialty,
      providerName,
      doctorName: providerName,
      physicianName: providerName,
      pcp: providerName,
      referringProvider: providerName,
      pharmacy: pick(PHARMACIES),
      medication: med1.name,
      currentMedications: `${med1.name}, ${med2.name}`, // two different drugs of different classes
      allergy,
      allergies: allergy, // one allergy answer, never contradicting itself
      bloodType: pick(BLOOD_TYPES),

      // ---- healthcare: vitals ----
      heightFt: String(heightFt),
      heightIn: String(heightIn),
      heightInches: String(heightInches),
      heightCm: String(heightCm),
      height: `${heightFt}'${heightIn}"`,
      weightLb: String(weightLb),
      weightKg: String(weightKg),
      weight: String(weightLb),
      bp: `${bpSys}/${bpDia}`,
      bpSystolic: String(bpSys),
      bpDiastolic: String(bpDia),
      bloodPressure: `${bpSys}/${bpDia}`,
      heartRate: String(heartRate),
      pulse: String(heartRate),
      temperature: tempF,
      temperatureF: tempF,
      temperatureC: tempC,
      respiratoryRate: String(respRate),
      oxygenSaturation: String(oxygenSat),

      // ---- healthcare: visit ----
      dateOfService: dos,
      dateOfServiceISO: iso(dosDate),
      visitDate: dos,
      appointmentDate: us(apptDate),
      appointmentTime,
      appointmentTime24: `${pad(apptH)}:${apptM}`,
      appointmentType,
      appointmentStatus: 'Scheduled',
      facility: pick(FACILITIES),
      today: us(now),
      admissionDate: us(admitDate),
      referralDate: us(referralDate),

      // ---- healthcare: coverage dates ----
      effectiveDate: us(effDate),
      terminationDate: us(termDate),

      // ---- healthcare: provider credentials ----
      providerType: providerTitle,
      providerDea,
      taxonomyCode,
      licenseName,
      taxId: `${pick(EIN_PREFIXES)}-${randInt(1000000, 9999999)}`,
      licenseNumber: `${stateInfo.code}${randInt(100000, 999999)}`,

      reasonForVisit: visit.reason,
      chiefComplaint: visit.complaint,
      symptoms: visit.symptoms,

      // ---- family / emergency contact ----
      emergencyName: `${ecFirst} ${ecLast}`,
      emergencyContactName: `${ecFirst} ${ecLast}`,
      emergencyFirstName: ecFirst,
      emergencyLastName: ecLast,
      proxyName: `${ecFirst} ${ecLast}`, // healthcare proxy / agent: usually the emergency contact
      subscriberName,
      subscriberFirstName: selfPay ? '' : subscriberFirst,
      subscriberLastName: selfPay ? '' : lastName,
      subscriberDob: selfPay ? '' : iso(subscriberDob),
      emergencyPhone: ecPhone,
      emergencyContactPhone: ecPhone,
      emergencyRelationship: ecRelationship,
      emergencyContactRelationship: ecRelationship,
      relationship: ecRelationship,
      // (A child's parent, as relationship lists also write it.)
      ...(child ? { emergencyRelationshipHints: ['Parent', 'Guardian', 'Legal Guardian'] } : {}),
      relationshipToSubscriber,

      // ---- generic ----
      bio: child ? `${firstName} is a ${ageYears}-year-old student living in ${loc.city}, ${stateInfo.code}, with ${isMale ? 'his' : 'her'} family. Enjoys reading, sports and spending time with friends.`
        : senior ? `${firstName} is retired and lives in ${loc.city}, ${stateInfo.code}. ` + pick(['Enjoys gardening, reading and time with family.', 'Volunteers at the local library and walks every morning.', 'Enjoys travel, cooking and time with grandchildren.'])
        : (() => {
        const jt = jobTitle.split(' ').map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
        const an = /^[A-Z]{2,}(\s|$)/.test(jt) ? /^[AEFHILMNORSX]/.test(jt) : /^[aeiou]/i.test(jt); // an HR…, a UX…
        const years = randInt(1, Math.max(1, Math.min(15, ageYears - 18))); // started working at 18 or later
        return `${firstName} is ${an ? 'an' : 'a'} ${jt} based in ${loc.city}, ${stateInfo.code}, with ${years} year${years === 1 ? '' : 's'} of experience. `;
      })() +
        pick(['Known for clear communication and dependable teamwork.', 'Enjoys mentoring new colleagues and improving day-to-day processes.', 'Focused on quality, safety and a friendly working environment.']),
      // A provider's bio ("Provider Bio"): their clinical title and specialty.
      providerBio: (() => {
        const years = randInt(1, Math.max(1, Math.min(30, ageYears - 26)));
        return `${firstName} is ${/^[aeiou]/i.test(titleLong) ? 'an' : 'a'} ${titleLong} in ${specialty} based in ${loc.city}, ${stateInfo.code}, with ${years} year${years === 1 ? '' : 's'} of clinical experience. ` +
          pick(['Focused on patient-centered care and clear communication.', 'Committed to preventive care and shared decision-making with patients.', 'Works closely with the care team to coordinate follow-up and education.']);
      })(),
      comment: noteA,
      notes: noteB,
      number: String(randInt(1, 100)),
      quantity: String(randInt(1, 10)),
      amount: (Math.random() * 1000).toFixed(2),
      // Who this is, for FillCraft itself (the popup's "same person" line); not a field.
      _profile: { band: prof.band, insurance: selfPay ? 'none' : onMedicare ? 'medicare' : onMedicaid ? 'medicaid' : 'private' },
    };
  }

  // ---------- invalid generator ----------
  // 'random' draws an independent invalid variant PER FIELD from every style that
  // defines one, so a single fill mixes format / type / range / length violations.
  // A specific style applies only that style's variants.
  // `base`: the person to start from ("Keep the same person"); otherwise a new one of `profile`.
  const copyOf = (o) => JSON.parse(JSON.stringify(o));
  function generateInvalid(type = 'random', profile, base) {
    const v = base ? copyOf(base) : generateValid(profile);

    const map = {
      format: {
        email: 'not-an-email-address',
        emailAlt: 'foo@@bar..com',
        phone: '12abc',
        phoneDigits: '12',
        phoneDashed: 'phone-number',
        phoneFormatted: 'call me',
        phoneAreaCode: 'AB',
        mobile: 'no-number',
        homePhone: '555-CALL-NOW',
        altPhone: 'call later',
        workPhone: '(12) 34',
        fax: 'fax me',
        emergencyPhone: '+1 (',
        username: 'user name with spaces',
        zip: 'ABCDE',
        zip4: '999',
        ssn: 'SSN-NUMBER',
        ccNumber: '1234',
        ccCvv: 'abc',
        ccExp: '13/99',
        url: 'not a url',
        website: 'just text not a url',
        dob: '99/99/9999',
        dobUS: '13/45/2099',
        npi: 'NOT-AN-NPI',
        mrn: '!!@@##',
        memberId: '$$$',
        dea: '12345',
        icd10: 'NOTACODE',
        cpt: 'XX',
        effectiveDate: '13/45/2024',
        terminationDate: '00/00/0000',
        appointmentDate: '02/30/2025',
        appointmentTime: '25:61',
        today: '13/45/2024',
        admissionDate: '02/30/2025',
        referralDate: '99/99/9999',
        subscriberDob: '99/99/9999',
        password: 'password',
        passwordConfirm: 'mismatch-123',
        weight: 'heavy',
        height: 'tall',
        heightIn: 'x',
        timeZone: 'Mars/Olympus_Mons',
        taxId: 'ABC-DEFG',
        licenseNumber: '!!@@',
      },
      type: {
        firstName: '12345',
        lastName: '!!!@@@',
        emergencyFirstName: '12345',
        emergencyLastName: '!!!@@@',
        subscriberFirstName: '12345',
        subscriberLastName: '!!!@@@',
        fullName: '99 88 77',
        middleName: '12345',
        email: '12345',
        phone: 'abcdefghij',
        mobile: 'abcdefghij',
        homePhone: 'abcdefghij',
        altPhone: 'abcdefghij',
        workPhone: 'abcdefghij',
        fax: 'abcdefghij',
        emergencyPhone: 'abcdefghij',
        address1: '#$%^&*',
        city: '999',
        company: '!@#$%^&*()',
        jobTitle: '00000',
        age: 'twenty',
        yearsExperience: 'many',
        hoursPerWeek: 'full time',
        salary: 'lots',
        hourlyRate: 'cheap',
        county: '12345',
        phoneExt: 'ext',
        number: 'abc',
        quantity: 'one',
        amount: 'free',
        zip: 'twelve',
        bloodType: 'Z+',
        heightFt: 'tall',
        weightLb: 'heavy',
        bpSystolic: 'high',
        weight: 'heavy',
        height: 'tall',
        heightIn: 'six',
        heightCm: 'tall',
        weightKg: 'heavy',
        bp: 'high/low',
        respiratoryRate: 'fast',
        password: '12345678',
        taxId: 'abcdefghi',
        effectiveDate: 'yesterday',
        appointmentTime: 'noon-ish',
      },
      range: {
        age: '-5',
        yearsExperience: '-3',
        hoursPerWeek: '200',
        salary: '-1000',
        hourlyRate: '-5.00',
        dob: '2099-12-31',
        dobUS: '12/31/2099',
        zip: '00000',            // never an assigned ZIP
        phone: '000-000-0000',
        mobile: '111-111-1111',
        homePhone: '000-000-0000',
        altPhone: '000-000-0000',
        workPhone: '111-111-1111',
        fax: '000-000-0000',
        emergencyPhone: '000-000-0000',
        ccExpYear: '1999',
        ccExpYearShort: '20',     // 2020 — expired ('99 reads as 2099)
        ccExp: '01/20',           // expired January 2020
        amount: '-1000.00',
        quantity: '-1',
        number: '99999999999999999999',
        ssn: '000-00-0000',       // area 000 is never valid
        heightFt: '99',
        heightIn: '99',
        heightCm: '999',
        height: '99\'99"',
        weightLb: '9999',
        weight: '9999',
        weightKg: '999',
        bp: '500/300',
        respiratoryRate: '200',
        today: '12/31/2099',
        admissionDate: '12/31/2099',   // check-in far in the future
        referralDate: '12/31/2099',    // referral in the future
        dateOfService: '12/31/2099',   // a visit that has not happened
        subscriberDob: '2099-12-31',
        bpSystolic: '500',
        bpDiastolic: '300',
        heartRate: '999',
        temperature: '999',
        oxygenSaturation: '150',
        effectiveDate: '01/01/2099',   // coverage that has not started
        terminationDate: '01/01/2000', // coverage already expired
        appointmentDate: '01/01/2000', // appointment in the past
        appointmentTime: '3:00 AM',    // outside clinic hours
      },
      length: {
        firstName: 'A',
        lastName: 'B',
        emergencyFirstName: 'A',
        emergencyLastName: 'B',
        subscriberFirstName: 'A',
        subscriberLastName: 'B',
        fullName: 'X',
        password: 'a',
        passwordConfirm: 'different-password',
        username: 'x',
        zip: '1',
        ssn: '1',
        phone: '1',
        mobile: '12',
        homePhone: '1'.repeat(25),
        altPhone: '1'.repeat(25),
        workPhone: '1',
        fax: '1',
        emergencyPhone: '12',
        bio: 'x'.repeat(10000),
        comment: 'a'.repeat(10000),
        email: 'a'.repeat(300) + '@example.com',
        npi: '1',
        mrn: '9'.repeat(50),
        memberId: 'A',
      },
    };
    // Format violations for the remaining identifier / free-text fields, so "Wrong
    // format" and "Random mix" cover them too.
    Object.assign(map.format, {
      patientId: '!!@@', subscriberId: '$$$', groupNumber: 'GRP#!', policyNumber: '###',
      ssnLast4: '12a', streetNumber: 'ABC', address2: '#@!', middleInitial: '1',
      ccName: '12345', ccExpMonth: '13', ccExpYear: '20XX', emergencyName: '!!!',
      heightCm: 'tall', weightKg: 'heavy', respiratoryRate: 'fast', heartRate: 'fast',
      temperature: 'hot', oxygenSaturation: 'ok', bpDiastolic: 'low', bp: '120-80-x',
      dateOfService: '13/45/2024', age: 'forty', middleName: '12345',
    });
    // Used for fields no pattern recognised, so they are invalid too.
    const generic = { format: '###@@@!!!', type: '12345', range: '-1', length: 'x' };
    // Keys that are not form fields on their own (helpers / alternative formats).
    const NOT_FIELDS = new Set(['alternates', 'timeZoneNames', 'passwordRandom', 'appointmentTime24', 'mailinatorInbox', 'phoneFormatted', 'phoneDashed', 'phoneIntl', 'dobUS', 'dateOfServiceISO',
      'emergencyRelationshipHints', 'insuranceTypeHints']);

    const out = Object.assign({}, v);
    if (type === 'random') {
      // Every field gets a violation: a style-specific one where defined, otherwise a
      // generic invalid value — each drawn independently per field.
      const styles = Object.keys(map);
      for (const k of Object.keys(v)) {
        if (NOT_FIELDS.has(k) || k.startsWith('_')) continue;
        const withVariant = styles.filter((s) => k in map[s]);
        out[k] = withVariant.length ? map[pick(withVariant)][k] : generic[pick(styles)];
      }
      out._generic = generic[pick(styles)];
      // (Random mix: each unrecognised field draws its own value from this pool.)
      out._genericPool = styles.map((s) => generic[s]);
    } else {
      Object.assign(out, map[type] || map.format);
      out._generic = generic[type] || generic.format;
    }
    return out;
  }

  // ---------- edge-case generator ----------
  function generateEdge(type = 'random', profile, givenBase) {
    const variants = {
      long: 'A'.repeat(5000),
      xss: '<script>alert("XSS")</script><img src=x onerror=alert(1)>',
      sql: "' OR '1'='1' --",
      unicode: '𝓣𝓮𝓼𝓽 你好世界 مرحبا עברית 😀👩‍⚕️',
      whitespace: '   leading and trailing   ',
      boundary: '0',
      empty: '     ',
    };
    const styles = ['long', 'xss', 'sql', 'unicode', 'whitespace', 'boundary', 'empty'];
    // An unknown type falls back to a random mix (never undefined values).
    const pickStyle = type in variants ? () => type : () => pick(styles);

    const apply = (obj) => {
      const out = {};
      // (Lists and repeated-row values are not fields: kept as they are.)
      for (const k of Object.keys(obj)) out[k] = typeof obj[k] === 'string' && !k.startsWith('_') ? variants[pickStyle()] : obj[k];
      return out;
    };

    const base = givenBase ? copyOf(givenBase) : generateValid(profile);
    const edge = apply(base);
    // Used for fields no pattern recognised, so they get a payload too.
    edge._generic = variants[pickStyle()];
    // (Random mix: each unrecognised field draws its own payload from this pool.)
    if (!(type in variants)) edge._genericPool = styles.map((s) => variants[s]);

    if (type === 'boundary') {
      Object.assign(edge, {
        age: '0',
        number: '2147483648',
        quantity: '999999999999',
        amount: '0.00',
        zip: '00000',
        ccCvv: '0',
        // Every date gets the oldest date (a date picker cannot hold "0"), times midnight.
        dob: '1900-01-01',
        dobUS: '01/01/1900',
        effectiveDate: '01/01/1900',
        terminationDate: '01/01/1900',
        appointmentDate: '01/01/1900',
        dateOfService: '01/01/1900',
        dateOfServiceISO: '1900-01-01',
        visitDate: '01/01/1900',
        admissionDate: '01/01/1900',
        referralDate: '01/01/1900',
        subscriberDob: '1900-01-01',
        today: '01/01/1900',
        appointmentTime: '12:00 AM',
        appointmentTime24: '00:00',
      });
    }
    return edge;
  }

  // globalThis: also loaded by the popup and the service worker (no `window` there),
  // which generate one dataset per fill so every frame of a page gets the same person.
  globalThis.QAData = {
    generateValid,
    generateInvalid,
    generateEdge,
    STATES,
    LOCATIONS,
  };
})();
