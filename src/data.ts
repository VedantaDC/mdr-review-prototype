export const MDR_HEADERS = [
  'Report Number',
  'Event Date',
  'Date Entered',
  'FDA Received Date',
  'Manufacturer Aware Date',
  'Last Submission Date',
  'Manufacturer Name',
  'Brand Name',
  'Generic Name',
  'Product Code',
  'Model Number',
  'Device Lot Number',
  'Catalog Number',
  'Serial Number',
  'PMA 510K Number',
  'Device Manufactured Date',
  'Date Returned to Manufacturer',
  'UDI Number',
  'UDI DI',
  'UDI Lot Number',
  'UDI Serial Number',
  'UDI Manufacturing Date',
  'UDI Expiration Date',
  'UDI Donation ID',
  'Concomitant Products',
  'Event Type',
  'Event Description',
  'Manufacturer Narrative',
  'Lab Test',
  'Medical History',
  'MedSun Narrative',
  'User Facility',
  'Reporter City',
  'Reporter State',
  'Reporter Country',
  'Type of Reporter',
  'Patient Age (Days)',
  'Patient Date of Birth',
  'Patient Sex',
  'Patient Weight (KG)',
  'Patient Ethnicity',
  'Patient Race',
  'Date Implanted',
  'Date Explanted',
  'Health Effect Clinical Code',
  'Health Effect Impact Code',
  'Device Problem Code',
  'Device Component Code',
  'Investigation Type Code',
  'Investigation Findings Code',
  'Investigation Conclusion Code',
  'Remedial Action Type',
  'Exemption Number',
  'Latest Report Version',
  'Is Summary Report?',
  'Number of Events',
  'Report Source',
  'Code Blue Flag',
  'Code Blue Type',
] as const;

export type MdrHeader = (typeof MDR_HEADERS)[number];
export type MdrFieldMap = Record<MdrHeader, string>;

export type MdrRecord = {
  id: string;
  assignedReviewer: string;
  assignedTeam: string;
  rationalGroup: string;
  priority: 'High Priority' | 'Routine';
  reviewStatus: 'Due in 2 days' | 'Due in 5 days' | 'In review' | 'Due this week' | 'On monitoring track';
  dueDate: string;
  linkedIssueIds: string[];
  linkedLetterIds: string[];
  tags: string[];
  fields: MdrFieldMap;
};

export type IssueItem = {
  id: string;
  title: string;
  status: 'Escalate' | 'Monitoring' | 'Watch' | 'AI Follow-up';
  severity: 'High' | 'Medium' | 'Low';
  cadence: string;
  focus: string;
  monitoringQuery: string;
  linkedMdrIds: string[];
  linkedLetterIds: string[];
  owner: string;
  lastUpdated: string;
  alertSummary: string;
  notes: string;
};

export type AiLetter = {
  id: string;
  issueId: string;
  manufacturer: string;
  subject: string;
  status: 'Drafting' | 'Sent' | 'AIR Received' | 'Closed';
  sentDate: string;
  responseDue: string;
  nextStep: string;
  owner: string;
};

export type SavedSearch = {
  id: string;
  title: string;
  description: string;
  query: string;
  scope: 'All Fields' | MdrHeader;
  mode: 'Structured' | 'Semantic';
};

const CURRENT_REVIEWER = 'John Smith';
const CURRENT_TEAM = 'Medical Device Team';

function createFields(partial: Partial<MdrFieldMap>): MdrFieldMap {
  const base = Object.fromEntries(MDR_HEADERS.map((header) => [header, ''])) as MdrFieldMap;

  for (const [key, value] of Object.entries(partial)) {
    base[key as MdrHeader] = value ?? '';
  }

  return base;
}

function formatDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

function createRecord(config: {
  id: string;
  assignedReviewer?: string;
  assignedTeam?: string;
  rationalGroup: string;
  priority: MdrRecord['priority'];
  reviewStatus: MdrRecord['reviewStatus'];
  dueDate: string;
  linkedIssueIds: string[];
  linkedLetterIds: string[];
  tags: string[];
  fields: Partial<MdrFieldMap>;
}): MdrRecord {
  return {
    id: config.id,
    assignedReviewer: config.assignedReviewer ?? CURRENT_REVIEWER,
    assignedTeam: config.assignedTeam ?? CURRENT_TEAM,
    rationalGroup: config.rationalGroup,
    priority: config.priority,
    reviewStatus: config.reviewStatus,
    dueDate: config.dueDate,
    linkedIssueIds: config.linkedIssueIds,
    linkedLetterIds: config.linkedLetterIds,
    tags: config.tags,
    fields: createFields({
      'Type of Reporter': 'Manufacturer',
      'Reporter Country': 'USA',
      'Latest Report Version': 'Version 1',
      'Number of Events': '1',
      ...config.fields,
    }),
  };
}

const productCatalog = {
  BZD: {
    code: 'BZD:Ventilator, non-continuous (respirator)',
    generic: 'VENTILATOR, NON-CONTINUOUS (RESPIRATOR)',
    rationalGroup: 'Sleep Ventilation Interfaces',
  },
  QNX: {
    code: 'QNX:Positive airway pressure interface',
    generic: 'POSITIVE AIRWAY PRESSURE INTERFACE',
    rationalGroup: 'Home NIV and PAP Interfaces',
  },
  LPR: {
    code: 'LPR:Hospital noninvasive ventilation mask',
    generic: 'NONINVASIVE VENTILATION MASK, HOSPITAL USE',
    rationalGroup: 'Acute Care Ventilation Accessories',
  },
  TMV: {
    code: 'TMV:Heated respiratory humidifier component',
    generic: 'HEATED RESPIRATORY HUMIDIFIER COMPONENT',
    rationalGroup: 'Thermal Respiratory Accessories',
  },
} as const;

type Template = {
  manufacturer: string[];
  brand: string;
  shortCode: keyof typeof productCatalog;
  eventType: string;
  issueId: string;
  aiLetterId?: string;
  tags: string[];
  city: string;
  state: string;
  healthEffect: string;
  healthImpact: string;
  deviceProblem: string;
  deviceComponent?: string;
  investigationType: string;
  investigationFindings: string;
  investigationConclusion: string;
  reportSource?: string;
  codeBlueFlag?: string;
  codeBlueType?: string;
  eventDescription: string;
  manufacturerNarrative: string;
  medicalHistory?: string;
  medsunNarrative?: string;
  userFacility?: string;
  isSummaryReport?: string;
  exemptionNumber?: string;
  numberOfEvents?: string;
  reporterType?: string;
};

const routineTemplates: Template[] = [
  {
    manufacturer: ['SomnaCare Interfaces', 'SomnaCare Interface Solutions'],
    brand: 'SoftSeal Nasal Cushion',
    shortCode: 'BZD',
    eventType: 'Serious Injury',
    issueId: 'ISS-304',
    aiLetterId: 'AI-404',
    tags: ['Skin irritation', 'Routine queue'],
    city: 'Minneapolis',
    state: 'MN',
    healthEffect: '4545:skin inflammation/irritation; 4537:blister',
    healthImpact: '4644:medication required',
    deviceProblem: '2682:patient-device incompatibility',
    deviceComponent: '4745:mask cushion',
    investigationType: '4114:device not returned',
    investigationFindings: '3221:no findings available',
    investigationConclusion: '4315:cause not established',
    eventDescription:
      'User reported blistering, redness, and burning sensation across the bridge of the nose after nightly use. Event language clusters with recent irritation complaints on the same interface family.',
    manufacturerNarrative:
      'Manufacturer initiated lot review and requested cleaning history. No returned sample available. Complaint routed into the ongoing skin-injury trend file.',
    medicalHistory: 'Obstructive sleep apnea; sensitive skin history',
  },
  {
    manufacturer: ['Harbor Respiratory Devices'],
    brand: 'HarborSeal Total Face Interface',
    shortCode: 'LPR',
    eventType: 'Serious Injury',
    issueId: 'ISS-306',
    aiLetterId: 'AI-405',
    tags: ['Pressure injury', 'Hospital use'],
    city: 'Seattle',
    state: 'WA',
    healthEffect: '2139:wound; 4545:skin inflammation/irritation',
    healthImpact: '4641:unexpected medical intervention',
    deviceProblem: '2682:patient-device incompatibility',
    deviceComponent: '4745:mask cushion',
    investigationType: '4116:device evaluation pending return',
    investigationFindings: '3233:results pending completion of investigation',
    investigationConclusion: '11:conclusion not yet available',
    reportSource: 'MedSun',
    reporterType: 'Facility',
    eventDescription:
      'Facility reported cheek pressure injury after prolonged postoperative NIV use. Narrative requests comparison against prior acute-care face-interface events and whether the issue should remain under monitoring.',
    manufacturerNarrative:
      'Manufacturer requested fit photos, dressing details, and duration-of-use information. Complaint linked to hospital pressure-distribution review.',
    medsunNarrative:
      'Facility requested trending support for postoperative pressure injuries and comparative review with other total-face interface complaints.',
    userFacility: 'Harbor University Hospital',
  },
  {
    manufacturer: ['RespiraNorth Home Care'],
    brand: 'BreezeLite Nasal Mask',
    shortCode: 'QNX',
    eventType: 'Malfunction',
    issueId: 'ISS-305',
    tags: ['Seal loss', 'Headgear wear'],
    city: 'Columbus',
    state: 'OH',
    healthEffect: '4582:no clinical signs, symptoms or conditions',
    healthImpact: '2199:no health consequences or impact',
    deviceProblem: '1388:device difficult to assemble or seal',
    deviceComponent: '4757:headgear',
    investigationType: '4124:testing of device from production line',
    investigationFindings: '3218:wear beyond expected life',
    investigationConclusion: '4334:design review initiated',
    isSummaryReport: 'Yes',
    exemptionNumber: 'EX-2026-17',
    numberOfEvents: '8',
    eventDescription:
      'Complaint described early headgear loosening and recurring seal loss after shorter-than-expected wear duration. Report frequently appears in summary-report bundles.',
    manufacturerNarrative:
      'Firm tied the complaint to a materials review for an elastomer supplier change and is tracking recurrence across headgear lots.',
  },
  {
    manufacturer: ['Ventrix Sleep Systems'],
    brand: 'AeroView Oral-Nasal Mask',
    shortCode: 'QNX',
    eventType: 'Other',
    issueId: 'ISS-307',
    tags: ['Dental pressure', 'Unusual complaint'],
    city: 'San Diego',
    state: 'CA',
    healthEffect: '2427:sensitivity of teeth',
    healthImpact: '4649:unanticipated adverse device effect',
    deviceProblem: '4001:patient device interaction problem',
    investigationType: '4114:device not returned',
    investigationFindings: '3221:no findings available',
    investigationConclusion: '4315:cause not established',
    reportSource: 'Voluntary',
    eventDescription:
      'Voluntary narrative described bite change, upper incisor sensitivity, and dental alignment concern after prolonged use of the oral-nasal mask design.',
    manufacturerNarrative:
      'Manufacturer could not confirm a device defect and tagged the complaint for ongoing review of pressure-distribution design assumptions.',
  },
  {
    manufacturer: ['NorthLake Pediatric Respiratory'],
    brand: 'NorthLake Junior Flow Mask',
    shortCode: 'QNX',
    eventType: 'Malfunction',
    issueId: 'ISS-309',
    aiLetterId: 'AI-406',
    tags: ['Pediatric fit', 'Leak trend'],
    city: 'Buffalo',
    state: 'NY',
    healthEffect: '4582:no clinical signs, symptoms or conditions',
    healthImpact: '2199:no health consequences or impact',
    deviceProblem: '1576:leak/splash',
    deviceComponent: '4745:mask frame',
    investigationType: '4128:labeling review',
    investigationFindings: '3240:known use environment interaction',
    investigationConclusion: '4334:design review initiated',
    eventDescription:
      'Complaint described recurring mask leaks in smaller pediatric faces despite following the fitting guide, causing repeated overnight alarm interruptions.',
    manufacturerNarrative:
      'Firm is reviewing fit-guide sizing language and the distribution of complaints by age band and mask size.',
  },
  {
    manufacturer: ['AeroPulse Home Systems'],
    brand: 'PulseMist Humidifier Chamber',
    shortCode: 'TMV',
    eventType: 'Malfunction',
    issueId: 'ISS-308',
    tags: ['Residue', 'Material shedding'],
    city: 'Kansas City',
    state: 'MO',
    healthEffect: '4582:no clinical signs, symptoms or conditions',
    healthImpact: '2199:no health consequences or impact',
    deviceProblem: '2978:material integrity problem',
    deviceComponent: '4764:humidifier chamber',
    investigationType: '4124:testing of device from production line',
    investigationFindings: '3217:particulate observed',
    investigationConclusion: '4334:design review initiated',
    eventDescription:
      'User reported visible residue and fine particulate in the humidifier chamber after several weeks of use. No injury reported, but complaint language is increasing.',
    manufacturerNarrative:
      'Manufacturer opened an internal review for chamber material stability and retained sample testing.',
  },
];

const highPriorityTemplates: Template[] = [
  {
    manufacturer: ['CalmAir Medical', 'CALM AIR MEDICAL', 'CalmAir Med.'],
    brand: 'NightSpring Valve Interface Kit',
    shortCode: 'BZD',
    eventType: 'Death',
    issueId: 'ISS-301',
    aiLetterId: 'AI-401',
    tags: ['Recall cluster', 'Death', 'Code Blue'],
    city: 'Baltimore',
    state: 'MD',
    healthEffect: '4580:insufficient information; 1841:cardiorespiratory arrest',
    healthImpact: '1802:death',
    deviceProblem: '2423:obstruction of flow',
    deviceComponent: '4755:valve assembly',
    investigationType: '4118:type of investigation not yet determined',
    investigationFindings: '3233:results pending completion of investigation',
    investigationConclusion: '11:conclusion not yet available',
    codeBlueFlag: 'Yes',
    codeBlueType: 'Death',
    eventDescription:
      'Recall-associated complaint describing failure of the controlled leak pathway during ventilatory support setup. Report is coded as death with limited causal detail and aligns with recent recall-linked narrative language.',
    manufacturerNarrative:
      'Manufacturer linked the report to the ongoing recall campaign and is preparing lot genealogy and manufacturing history review.',
    medicalHistory: 'Chronic respiratory failure',
  },
  {
    manufacturer: ['AeroPulse Home Systems'],
    brand: 'PulseMist Heated Humidifier Module',
    shortCode: 'TMV',
    eventType: 'Serious Injury',
    issueId: 'ISS-302',
    aiLetterId: 'AI-402',
    tags: ['Thermal event', 'Burn risk'],
    city: 'Austin',
    state: 'TX',
    healthEffect: '2058:burn',
    healthImpact: '4641:unexpected medical intervention',
    deviceProblem: '1104:overheating',
    deviceComponent: '4764:humidifier chamber',
    investigationType: '4116:device evaluation pending return',
    investigationFindings: '3233:results pending completion of investigation',
    investigationConclusion: '11:conclusion not yet available',
    codeBlueFlag: 'Yes',
    codeBlueType: 'Thermal event',
    eventDescription:
      'Customer reported visible overheating and a superficial hand burn while disconnecting the heated humidifier chamber after an alarm. Complaint was routed as a high-priority thermal event.',
    manufacturerNarrative:
      'Manufacturer requested device return and is reviewing firmware logs, heater plate performance, and complaint distribution by software revision.',
  },
  {
    manufacturer: ['Ventrix Sleep Systems'],
    brand: 'OrbitFit F30i Interface',
    shortCode: 'QNX',
    eventType: 'Serious Injury',
    issueId: 'ISS-303',
    aiLetterId: 'AI-403',
    tags: ['Magnetic interference', 'Code Blue'],
    city: 'Raleigh',
    state: 'NC',
    healthEffect: '2194:dizziness; 2553:confusion/disorientation; 1848:fall',
    healthImpact: '4649:unanticipated adverse device effect',
    deviceProblem: '2682:patient-device incompatibility',
    deviceComponent: '4713:magnetic clip',
    investigationType: '4114:device not returned',
    investigationFindings: '3221:no findings available',
    investigationConclusion: '4315:cause not established',
    codeBlueFlag: 'Yes',
    codeBlueType: 'Serious Injury',
    eventDescription:
      'Reporter described dizziness, confusion, and falls when using a full-face interface with magnetic clips in the setting of an implanted programmable device.',
    manufacturerNarrative:
      'Manufacturer initiated labeling review and requested clinical timeline details to assess possible magnetic interference.',
  },
  {
    manufacturer: ['Harbor Respiratory Devices'],
    brand: 'HarborSeal Behavioral Safety Interface',
    shortCode: 'LPR',
    eventType: 'Other',
    issueId: 'ISS-310',
    tags: ['Suicide ideation', 'High priority'],
    city: 'Chicago',
    state: 'IL',
    healthEffect: '2892:suicidal ideation',
    healthImpact: '4649:unanticipated adverse device effect',
    deviceProblem: '2993:adverse event without identified device or use problem',
    deviceComponent: '4745:mask assembly',
    investigationType: '4114:device not returned',
    investigationFindings: '3221:no findings available',
    investigationConclusion: '4315:cause not established',
    codeBlueFlag: 'Yes',
    codeBlueType: 'Suicide ideation',
    eventDescription:
      'Narrative describes suicidal ideation reported during follow-up discussion of device use and sleep disruption. Event was elevated for high-priority review because of the patient-safety concern, despite unclear device contribution.',
    manufacturerNarrative:
      'Manufacturer documented outreach to obtain additional clinical context and escalation through internal medical review.',
  },
];

const hpStatusCycle: MdrRecord['reviewStatus'][] = ['Due in 2 days', 'Due in 5 days', 'In review'];
const routineStatusCycle: MdrRecord['reviewStatus'][] = ['Due this week', 'In review', 'On monitoring track'];

function createGeneratedRecords(
  count: number,
  templates: Template[],
  priority: MdrRecord['priority'],
  startIndex: number,
) {
  return Array.from({ length: count }, (_, offset) => {
    const template = templates[offset % templates.length];
    const catalog = productCatalog[template.shortCode];
    const receivedDate = new Date(2026, 2, 24);
    receivedDate.setDate(receivedDate.getDate() - ((offset * 3) % (priority === 'High Priority' ? 28 : 140)));
    const awareDate = new Date(receivedDate);
    awareDate.setDate(awareDate.getDate() - 1);
    const eventDate = new Date(receivedDate);
    eventDate.setDate(eventDate.getDate() - ((offset % 5) + 1));
    const enteredDate = new Date(receivedDate);
    enteredDate.setDate(enteredDate.getDate() + 1);
    const dueDate = new Date(2026, 2, priority === 'High Priority' ? 27 + (offset % 7) : 28 + (offset % 12));
    const manufacturer = template.manufacturer[offset % template.manufacturer.length];
    const reportSource = template.reportSource ?? 'Manufacturer';
    const reportNumber =
      reportSource === 'Voluntary'
        ? `MW${String(5100000 + startIndex + offset).padStart(7, '0')}`
        : `${String(2518422 + (offset % 7)).padStart(7, '0')}-2026-${String(startIndex + offset).padStart(5, '0')}`;

    return createRecord({
      id: reportNumber,
      rationalGroup: catalog.rationalGroup,
      priority,
      reviewStatus: priority === 'High Priority' ? hpStatusCycle[offset % hpStatusCycle.length] : routineStatusCycle[offset % routineStatusCycle.length],
      dueDate: dueDate.toISOString().slice(0, 10),
      linkedIssueIds: [template.issueId],
      linkedLetterIds: template.aiLetterId ? [template.aiLetterId] : [],
      tags: template.tags,
      fields: {
        'Report Number': reportNumber,
        'Event Date': formatDate(eventDate),
        'Date Entered': formatDate(enteredDate),
        'FDA Received Date': formatDate(receivedDate),
        'Manufacturer Aware Date': formatDate(awareDate),
        'Last Submission Date': formatDate(enteredDate),
        'Manufacturer Name': manufacturer,
        'Brand Name': template.brand,
        'Generic Name': catalog.generic,
        'Product Code': catalog.code,
        'Model Number': `${template.shortCode}-${100 + (offset % 40)}`,
        'Device Lot Number': `LOT-${template.shortCode}-${200 + (offset % 90)}`,
        'Catalog Number': `CAT-${template.shortCode}-${300 + (offset % 70)}`,
        'Serial Number': `SN-${template.shortCode}-${startIndex + offset}`,
        'PMA 510K Number': `K24${String(1000 + (offset % 700)).padStart(4, '0')}`,
        'UDI Number': `0081${String(startIndex + offset).padStart(10, '0')}`,
        'UDI DI': `${template.shortCode}${String(5000 + (offset % 300)).padStart(4, '0')}`,
        'UDI Lot Number': `LOT-${template.shortCode}-${200 + (offset % 90)}`,
        'Concomitant Products': offset % 5 === 0 ? 'Humidifier tubing set' : '',
        'Event Type': template.eventType,
        'Event Description': template.eventDescription,
        'Manufacturer Narrative': template.manufacturerNarrative,
        'Medical History': template.medicalHistory ?? '',
        'MedSun Narrative': template.medsunNarrative ?? '',
        'User Facility': template.userFacility ?? '',
        'Reporter City': template.city,
        'Reporter State': template.state,
        'Type of Reporter': template.reporterType ?? 'Manufacturer',
        'Patient Age (Days)': String(14000 + ((offset * 37) % 12000)),
        'Patient Sex': offset % 2 === 0 ? 'F' : 'M',
        'Health Effect Clinical Code': template.healthEffect,
        'Health Effect Impact Code': template.healthImpact,
        'Device Problem Code': template.deviceProblem,
        'Device Component Code': template.deviceComponent ?? '',
        'Investigation Type Code': template.investigationType,
        'Investigation Findings Code': template.investigationFindings,
        'Investigation Conclusion Code': template.investigationConclusion,
        'Remedial Action Type': priority === 'High Priority' ? 'Field correction review' : '',
        'Exemption Number': template.exemptionNumber ?? '',
        'Is Summary Report?': template.isSummaryReport ?? 'No',
        'Number of Events': template.numberOfEvents ?? '1',
        'Report Source': reportSource,
        'Code Blue Flag': template.codeBlueFlag ?? 'No',
        'Code Blue Type': template.codeBlueType ?? '',
      },
    });
  });
}

const generatedRoutineRecords = createGeneratedRecords(1480, routineTemplates, 'Routine', 1000);
const generatedHighPriorityRecords = createGeneratedRecords(24, highPriorityTemplates, 'High Priority', 3000);

export const mdrRecords: MdrRecord[] = [...generatedRoutineRecords, ...generatedHighPriorityRecords];

export const reviewerProfile = {
  name: CURRENT_REVIEWER,
  title: 'Medical Device Team',
  team: CURRENT_TEAM,
  productCodes: ['BZD', 'QNX', 'LPR', 'TMV'],
  rationalGroup: 'Mixed Respiratory Device Portfolio',
  updatedAt: 'March 26, 2026 10:05 AM ET',
};

const aiLetterBlueprints: Omit<AiLetter, 'owner'>[] = [
  {
    id: 'AI-401',
    issueId: 'ISS-301',
    manufacturer: 'CalmAir Medical',
    subject: 'Recall-associated NightSpring valve complaints',
    status: 'Sent',
    sentDate: '2026-03-18',
    responseDue: '2026-04-08',
    nextStep: 'Await AIR with lot genealogy and complaint stratification.',
  },
  {
    id: 'AI-402',
    issueId: 'ISS-302',
    manufacturer: 'AeroPulse Home Systems',
    subject: 'Thermal event and electrical arcing characterization',
    status: 'Sent',
    sentDate: '2026-03-20',
    responseDue: '2026-04-10',
    nextStep: 'Review firmware revisions and return analysis once AIR arrives.',
  },
  {
    id: 'AI-403',
    issueId: 'ISS-303',
    manufacturer: 'Ventrix Sleep Systems',
    subject: 'Magnetic interference information request',
    status: 'AIR Received',
    sentDate: '2026-03-09',
    responseDue: '2026-03-30',
    nextStep: 'Review AIR and determine whether additional labeling follow-up is needed.',
  },
  {
    id: 'AI-404',
    issueId: 'ISS-304',
    manufacturer: 'SomnaCare Interfaces',
    subject: 'SoftSeal skin injury complaint characterization',
    status: 'Drafting',
    sentDate: '2026-03-26',
    responseDue: '2026-04-16',
    nextStep: 'Finalize questions on materials, cleaning instructions, and lot concentration.',
  },
  {
    id: 'AI-405',
    issueId: 'ISS-306',
    manufacturer: 'Harbor Respiratory Devices',
    subject: 'Acute-care pressure injury follow-up',
    status: 'AIR Received',
    sentDate: '2026-03-12',
    responseDue: '2026-04-02',
    nextStep: 'Compare AIR against MedSun and facility narratives before escalation decision.',
  },
  {
    id: 'AI-406',
    issueId: 'ISS-309',
    manufacturer: 'NorthLake Pediatric Respiratory',
    subject: 'Pediatric fit and leak complaint stratification',
    status: 'Drafting',
    sentDate: '2026-03-26',
    responseDue: '2026-04-15',
    nextStep: 'Confirm age-band breakdown and leak complaint denominator request.',
  },
];

export const aiLetters: AiLetter[] = aiLetterBlueprints.map((letter) => ({
  ...letter,
  owner: CURRENT_REVIEWER,
}));

const issueBlueprints = [
  {
    id: 'ISS-301',
    title: 'NightSpring recall valve obstruction cluster',
    status: 'Escalate' as const,
    severity: 'High' as const,
    cadence: 'Weekly HP review',
    focus: 'Recall-linked valve and controlled-leak complaints on NightSpring interface kits.',
    monitoringQuery: 'NightSpring or CalmAir + obstruction of flow + recall + controlled leak + valve sticking',
    lastUpdated: 'March 25, 2026',
    alertSummary: 'Death-coded and malfunction complaints continue to cluster across the recall population.',
    notes: 'This stays active even when the parent HP work items are closed on time.',
  },
  {
    id: 'ISS-302',
    title: 'Thermal and arcing high-priority watch',
    status: 'Escalate' as const,
    severity: 'High' as const,
    cadence: 'Weekly HP review',
    focus: 'Thermal, overheating, and electrical arcing complaints tied to heated respiratory accessories.',
    monitoringQuery: 'thermal event, overheating, burn, arcing, heated module, humidifier, elbow connector',
    lastUpdated: 'March 24, 2026',
    alertSummary: 'Thermal-event narratives remain low volume but high concern.',
    notes: 'AI activity is active; dashboard should keep this visible without manual re-search.',
  },
  {
    id: 'ISS-303',
    title: 'Magnetic interface interference watch',
    status: 'AI Follow-up' as const,
    severity: 'High' as const,
    cadence: 'Monthly monitor',
    focus: 'Magnetic clip interfaces and implanted programmable-device interaction language.',
    monitoringQuery: 'magnetic clip + shunt + dizziness + interference + non-magnetic alternative',
    lastUpdated: 'March 21, 2026',
    alertSummary: 'One AIR received and the trend remains active for longitudinal follow-up.',
    notes: 'Prototype behavior should preserve semantic matching across narrative variants.',
  },
  {
    id: 'ISS-304',
    title: 'SoftSeal skin-injury trend watch',
    status: 'Monitoring' as const,
    severity: 'Medium' as const,
    cadence: 'Monthly routine review',
    focus: 'Skin irritation, rash, and blister complaints on SoftSeal nasal interfaces.',
    monitoringQuery: 'SoftSeal + rash + blister + irritation + prescription cream',
    lastUpdated: 'March 23, 2026',
    alertSummary: 'Routine queue still shows recurrent irritation language across manufacturer-name variants.',
    notes: 'This should live in a monitoring queue, not get lost after routine closure.',
  },
  {
    id: 'ISS-305',
    title: 'BreezeLite headgear wear monitoring plan',
    status: 'Watch' as const,
    severity: 'Low' as const,
    cadence: 'Monthly summary-report check',
    focus: 'Seal loss and early headgear wear complaints in routine and summary reports.',
    monitoringQuery: 'BreezeLite + headgear + seal loss + stretch + early wear',
    lastUpdated: 'March 18, 2026',
    alertSummary: 'Stable low-level signal, mostly in summary-report material.',
    notes: 'Good example of “watch but do not escalate yet.”',
  },
  {
    id: 'ISS-306',
    title: 'Postoperative facial pressure consult watch',
    status: 'Monitoring' as const,
    severity: 'Medium' as const,
    cadence: 'Monthly consult review',
    focus: 'Pressure injuries associated with prolonged acute-care total-face interface use.',
    monitoringQuery: 'pressure injury + postoperative + ICU + total face interface',
    lastUpdated: 'March 20, 2026',
    alertSummary: 'Acute-care pressure narratives remain an active cross-functional review topic.',
    notes: 'This issue needs easier traceability across reviewers and consults.',
  },
  {
    id: 'ISS-307',
    title: 'Dental pressure signal watch',
    status: 'Watch' as const,
    severity: 'Low' as const,
    cadence: 'Quarterly trend review',
    focus: 'Dental alignment and tooth-sensitivity complaints tied to oral-nasal masks.',
    monitoringQuery: 'tooth + dental + bite change + incisor + oral-nasal mask',
    lastUpdated: 'March 11, 2026',
    alertSummary: 'Low count, but preserved due to unusual and potentially emerging complaint type.',
    notes: 'Useful prototype example for longitudinal monitoring of rare patterns.',
  },
  {
    id: 'ISS-308',
    title: 'Humidifier residue and material-shedding watch',
    status: 'Monitoring' as const,
    severity: 'Medium' as const,
    cadence: 'Monthly routine review',
    focus: 'Visible residue and particulate complaints in humidifier chambers.',
    monitoringQuery: 'humidifier residue + particulate + chamber + material integrity',
    lastUpdated: 'March 17, 2026',
    alertSummary: 'Routine complaints are increasing gradually and should remain visible.',
    notes: 'Good fit for an issue dashboard with automatic alerts for upward drift.',
  },
  {
    id: 'ISS-309',
    title: 'Pediatric fit and leak concern',
    status: 'AI Follow-up' as const,
    severity: 'Medium' as const,
    cadence: 'Monthly monitor',
    focus: 'Leak and poor-fit complaints in pediatric mask sizing bands.',
    monitoringQuery: 'pediatric + leak + fit guide + mask size + overnight alarm',
    lastUpdated: 'March 22, 2026',
    alertSummary: 'Recurring complaint language suggests sizing/labeling follow-up.',
    notes: 'Useful to show multiple reviewers or backup coverage later.',
  },
  {
    id: 'ISS-310',
    title: 'Voluntary and MedSun signal watch',
    status: 'Watch' as const,
    severity: 'Low' as const,
    cadence: 'Monthly review',
    focus: 'Unusual or emerging narratives arriving through voluntary and MedSun channels.',
    monitoringQuery: 'voluntary OR MedSun + unusual event language + uncommon health effect codes',
    lastUpdated: 'March 16, 2026',
    alertSummary: 'Held as a broad exploratory monitor for rare signals.',
    notes: 'Good placeholder for a user-managed issue bucket with natural-language alert rules.',
  },
] as const;

export const issueItems: IssueItem[] = issueBlueprints.map((issue) => ({
  ...issue,
  linkedMdrIds: mdrRecords
    .filter((record) => record.linkedIssueIds.includes(issue.id))
    .slice(0, 14)
    .map((record) => record.id),
  linkedLetterIds: aiLetters.filter((letter) => letter.issueId === issue.id).map((letter) => letter.id),
  owner: CURRENT_REVIEWER,
}));

export const savedSearches: SavedSearch[] = [
  {
    id: 'SEARCH-1',
    title: 'Thermal event monitor',
    description: 'Standing semantic search for overheating, burn, and arcing language across heated respiratory accessories.',
    query: 'thermal event overheating burn arcing heated module humidifier',
    scope: 'All Fields',
    mode: 'Semantic',
  },
  {
    id: 'SEARCH-2',
    title: 'Magnetic interference monitor',
    description: 'Tracks magnetic clip complaints using narrative similarity rather than exact wording alone.',
    query: 'magnetic clip interference shunt dizziness falls',
    scope: 'All Fields',
    mode: 'Semantic',
  },
  {
    id: 'SEARCH-3',
    title: 'SoftSeal skin injury monitor',
    description: 'Longitudinal search across brand and manufacturer-name variants for irritation language.',
    query: 'SoftSeal rash blister irritation prescription cream',
    scope: 'All Fields',
    mode: 'Semantic',
  },
];
