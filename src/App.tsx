import { Fragment, startTransition, useDeferredValue, useState } from 'react';
import {
  MDR_HEADERS,
  aiLetters,
  issueItems,
  mdrRecords,
  reviewerProfile,
  savedSearches,
  type MdrHeader,
  type MdrRecord,
} from './data';

type TabKey =
  | 'Overview'
  | 'Dashboard'
  | 'Routine Queue'
  | 'High Priority Queue'
  | 'Search'
  | 'Issue Tracker'
  | 'AI Letters'
  | 'Documentation';

const TABS: TabKey[] = [
  'Overview',
  'Dashboard',
  'Routine Queue',
  'High Priority Queue',
  'Search',
  'Issue Tracker',
  'AI Letters',
  'Documentation',
];

const DEFAULT_COLUMNS: MdrHeader[] = [
  'FDA Received Date',
  'Manufacturer Name',
  'Brand Name',
  'Product Code',
  'Event Type',
  'Health Effect Clinical Code',
  'Device Problem Code',
  'Code Blue Type',
];
const QUICK_COLUMN_CHOICES: MdrHeader[] = [
  'FDA Received Date',
  'Manufacturer Name',
  'Brand Name',
  'Generic Name',
  'Product Code',
  'Event Type',
  'Health Effect Clinical Code',
  'Health Effect Impact Code',
  'Device Problem Code',
  'Code Blue Type',
  'Report Source',
  'Type of Reporter',
];
const NARRATIVE_FIELDS: MdrHeader[] = ['Event Description', 'Manufacturer Narrative', 'MedSun Narrative', 'Medical History'];

const SEARCHABLE_FIELDS: ('All Fields' | MdrHeader)[] = ['All Fields', ...MDR_HEADERS];
const SAMPLE_PROMPTS = [
  'show thermal event complaints involving heated modules',
  'find skin irritation events on SoftSeal masks',
  'trend magnetic clip complaints with shunt language',
];
const DASHBOARD_WINDOWS = [
  { id: '30', label: '30d', days: 30 },
  { id: '90', label: '90d', days: 90 },
  { id: '180', label: '6m', days: 180 },
  { id: '365', label: '1y', days: 365 },
] as const;
const DASHBOARD_MODES = [
  ...DASHBOARD_WINDOWS.map((window) => ({ id: window.id, label: window.label })),
  { id: 'unreviewed', label: 'Unreviewed workload' },
  { id: 'custom', label: 'Custom' },
] as const;
type AdvancedFilterRow = {
  id: string;
  field: MdrHeader;
  value: string;
};
const STOP_WORDS = new Set([
  'show',
  'find',
  'trend',
  'the',
  'a',
  'an',
  'with',
  'for',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'all',
  'across',
  'involving',
  'current',
  'queue',
]);

function parseDate(value: string) {
  if (!value) {
    return new Date('2026-01-01');
  }
  const [month, day, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getField(record: MdrRecord, field: MdrHeader) {
  return record.fields[field] || '';
}

function getNarrativeBundle(record: MdrRecord) {
  return [getField(record, 'Event Description'), getField(record, 'Manufacturer Narrative'), getField(record, 'MedSun Narrative')]
    .filter(Boolean)
    .join(' ');
}

function shortCode(value: string) {
  return value.split(':')[0];
}

function semanticTokens(query: string) {
  const baseTokens = normalize(query)
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token));
  const expansions = new Set(baseTokens);
  const synonymMap: Record<string, string[]> = {
    thermal: ['overheating', 'burn', 'heated', 'temperature'],
    heated: ['thermal', 'overheating', 'humidifier', 'heater'],
    magnetic: ['magnet', 'magnetic', 'clip', 'interference', 'shunt'],
    shunt: ['programmable', 'setting', 'interference'],
    rash: ['rash', 'blister', 'irritation', 'dermatitis', 'burning'],
    irritation: ['rash', 'blister', 'irritation', 'burning', 'cracking'],
    seal: ['seal', 'leak', 'headgear', 'fit'],
    dental: ['dental', 'teeth', 'bite', 'incisor'],
    pressure: ['pressure', 'wound', 'injury', 'postoperative'],
    recall: ['recall', 'campaign', 'remediation'],
    suicide: ['suicidal', 'ideation', 'behavioral'],
  };

  baseTokens.forEach((token) => {
    (synonymMap[token] || []).forEach((match) => expansions.add(match));
  });

  return Array.from(expansions);
}

function recordMatchesQuery(record: MdrRecord, query: string, field: 'All Fields' | MdrHeader, semanticMode: boolean) {
  if (!query.trim()) {
    return true;
  }

  const values = field === 'All Fields' ? Object.values(record.fields) : [record.fields[field] || ''];
  const joined = values.join(' ').toLowerCase();
  const tokens = semanticMode
    ? semanticTokens(query)
    : normalize(query)
        .split(' ')
        .filter((token) => token && !STOP_WORDS.has(token));

  return tokens.every((token) => joined.includes(token));
}

function buildCsv(records: MdrRecord[]) {
  const rows = [MDR_HEADERS.join(',')];

  records.forEach((record) => {
    const cells = MDR_HEADERS.map((header) => `"${String(record.fields[header] ?? '').replace(/"/g, '""')}"`);
    rows.push(cells.join(','));
  });

  return rows.join('\n');
}

function downloadCsv(records: MdrRecord[], filename: string) {
  const blob = new Blob([buildCsv(records)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function sortByDueDate(records: MdrRecord[]) {
  return [...records].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

function sumEvents(records: MdrRecord[]) {
  return records.reduce((total, record) => total + Number.parseInt(getField(record, 'Number of Events') || '1', 10), 0);
}

function countBy(records: MdrRecord[], getKey: (record: MdrRecord) => string) {
  return Object.entries(
    records.reduce<Record<string, number>>((acc, record) => {
      const key = getKey(record) || 'Unspecified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
}

function takeTop(entries: Array<[string, number]>, limit: number) {
  return entries.slice(0, limit);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('Overview');
  const [selectedIssueId, setSelectedIssueId] = useState(issueItems[0].id);
  const [actionMessage, setActionMessage] = useState('');

  const [routineSearch, setRoutineSearch] = useState('');
  const [routineManufacturer, setRoutineManufacturer] = useState('All manufacturers');
  const [routineEventType, setRoutineEventType] = useState('All event types');
  const [routineVisibleColumns, setRoutineVisibleColumns] = useState<MdrHeader[]>(DEFAULT_COLUMNS);
  const [routineExpanded, setRoutineExpanded] = useState(false);
  const [routineShowAllColumns, setRoutineShowAllColumns] = useState(false);
  const [routineSelectedIds, setRoutineSelectedIds] = useState<string[]>([]);

  const [hpSearch, setHpSearch] = useState('');
  const [hpManufacturer, setHpManufacturer] = useState('All manufacturers');
  const [hpCategory, setHpCategory] = useState('All HP categories');
  const [hpVisibleColumns, setHpVisibleColumns] = useState<MdrHeader[]>(DEFAULT_COLUMNS);
  const [hpExpanded, setHpExpanded] = useState(false);
  const [hpShowAllColumns, setHpShowAllColumns] = useState(false);
  const [hpSelectedIds, setHpSelectedIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<'All Fields' | MdrHeader>('All Fields');
  const [structuredProductCode, setStructuredProductCode] = useState('All product codes');
  const [structuredManufacturer, setStructuredManufacturer] = useState('All manufacturers');
  const [structuredProblemCode, setStructuredProblemCode] = useState('All device problem codes');
  const [structuredStartDate, setStructuredStartDate] = useState('');
  const [structuredEndDate, setStructuredEndDate] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterRow[]>([]);

  const [dashboardScope, setDashboardScope] = useState<'Current queue' | 'Routine queue' | 'High priority queue' | 'All assigned product codes'>('Current queue');
  const [dashboardMode, setDashboardMode] = useState<(typeof DASHBOARD_MODES)[number]['id']>('90');
  const [dashboardProductCode, setDashboardProductCode] = useState<'All product codes' | string>('All product codes');
  const [dashboardPrompt, setDashboardPrompt] = useState('');
  const [dashboardManufacturer, setDashboardManufacturer] = useState('All manufacturers');
  const [dashboardEventType, setDashboardEventType] = useState('All event types');
  const [dashboardBrand, setDashboardBrand] = useState('All brands');
  const [dashboardHealthEffect, setDashboardHealthEffect] = useState('All health effect codes');
  const [dashboardDeviceProblem, setDashboardDeviceProblem] = useState('All device problem codes');
  const [dashboardReportSource, setDashboardReportSource] = useState('All report sources');
  const [dashboardCountry, setDashboardCountry] = useState('All countries');
  const [dashboardRemedialAction, setDashboardRemedialAction] = useState('All remedial actions');
  const [dashboardRationalGroup, setDashboardRationalGroup] = useState('All rational groups');
  const [dashboardSummaryReport, setDashboardSummaryReport] = useState('All reports');
  const [dashboardRecallOnly, setDashboardRecallOnly] = useState('All');
  const [showMoreDashboardFilters, setShowMoreDashboardFilters] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('2025-10-01');
  const [customEndDate, setCustomEndDate] = useState('2026-03-26');

  const deferredRoutineSearch = useDeferredValue(routineSearch);
  const deferredHpSearch = useDeferredValue(hpSearch);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredDashboardPrompt = useDeferredValue(dashboardPrompt);

  const assignedRecords = mdrRecords.filter((record) => record.assignedReviewer === reviewerProfile.name);
  const routineRecords = assignedRecords.filter((record) => record.priority === 'Routine');
  const highPriorityRecords = assignedRecords.filter((record) => record.priority === 'High Priority');

  const routineManufacturers = ['All manufacturers', ...new Set(routineRecords.map((record) => getField(record, 'Manufacturer Name')))];
  const routineEventTypes = ['All event types', ...new Set(routineRecords.map((record) => getField(record, 'Event Type')))];
  const hpManufacturers = ['All manufacturers', ...new Set(highPriorityRecords.map((record) => getField(record, 'Manufacturer Name')))];
  const hpCategories = ['All HP categories', ...new Set(highPriorityRecords.map((record) => getField(record, 'Code Blue Type')))];

  const filteredRoutineQueue = sortByDueDate(
    routineRecords.filter((record) => {
      if (routineManufacturer !== 'All manufacturers' && getField(record, 'Manufacturer Name') !== routineManufacturer) {
        return false;
      }
      if (routineEventType !== 'All event types' && getField(record, 'Event Type') !== routineEventType) {
        return false;
      }
      return recordMatchesQuery(record, deferredRoutineSearch, 'All Fields', true);
    }),
  );

  const filteredHighPriorityQueue = sortByDueDate(
    highPriorityRecords.filter((record) => {
      if (hpManufacturer !== 'All manufacturers' && getField(record, 'Manufacturer Name') !== hpManufacturer) {
        return false;
      }
      if (hpCategory !== 'All HP categories' && getField(record, 'Code Blue Type') !== hpCategory) {
        return false;
      }
      return recordMatchesQuery(record, deferredHpSearch, 'All Fields', true);
    }),
  );

  const searchManufacturers = ['All manufacturers', ...new Set(mdrRecords.map((record) => getField(record, 'Manufacturer Name')))];
  const searchProductCodes = ['All product codes', ...new Set(mdrRecords.map((record) => shortCode(getField(record, 'Product Code'))))];
  const searchProblemCodes = [
    'All device problem codes',
    ...new Set(
      mdrRecords.map((record) => (getField(record, 'Device Problem Code') || 'None').split(';')[0].trim()).filter(Boolean),
    ),
  ];

  const searchResults = sortByDueDate(
    mdrRecords.filter((record) => {
      if (deferredSearchQuery && !recordMatchesQuery(record, deferredSearchQuery, searchField, true)) {
        return false;
      }
      if (structuredProductCode !== 'All product codes' && shortCode(getField(record, 'Product Code')) !== structuredProductCode) {
        return false;
      }
      if (structuredManufacturer !== 'All manufacturers' && getField(record, 'Manufacturer Name') !== structuredManufacturer) {
        return false;
      }
      if (
        structuredProblemCode !== 'All device problem codes' &&
        !getField(record, 'Device Problem Code').includes(structuredProblemCode)
      ) {
        return false;
      }
      const receivedTime = parseDate(getField(record, 'FDA Received Date')).getTime();
      if (structuredStartDate && receivedTime < new Date(`${structuredStartDate}T00:00:00`).getTime()) {
        return false;
      }
      if (structuredEndDate && receivedTime > new Date(`${structuredEndDate}T23:59:59`).getTime()) {
        return false;
      }
      for (const filter of advancedFilters) {
        if (filter.value.trim() && !getField(record, filter.field).toLowerCase().includes(filter.value.toLowerCase())) {
          return false;
        }
      }
      return true;
    }),
  );

  const selectedIssue = issueItems.find((issue) => issue.id === selectedIssueId) ?? issueItems[0];
  const selectedIssueRecords = mdrRecords.filter((record) => selectedIssue.linkedMdrIds.includes(record.id));
  const selectedIssueLetters = aiLetters.filter((letter) => selectedIssue.linkedLetterIds.includes(letter.id));

  const dashboardWindowConfig = DASHBOARD_WINDOWS.find((window) => window.id === dashboardMode) ?? DASHBOARD_WINDOWS[1];
  const dashboardScopeRecords =
    dashboardScope === 'Routine queue'
      ? routineRecords
      : dashboardScope === 'High priority queue'
        ? highPriorityRecords
        : assignedRecords;

  const dashboardWindowStart = new Date('2026-03-26T10:05:00-04:00');
  dashboardWindowStart.setDate(dashboardWindowStart.getDate() - dashboardWindowConfig.days);
  const customStart = new Date(`${customStartDate}T00:00:00`);
  const customEnd = new Date(`${customEndDate}T23:59:59`);

  const dashboardRecords = dashboardScopeRecords.filter((record) => {
    const receivedTime = parseDate(getField(record, 'FDA Received Date')).getTime();
    if (dashboardMode === 'custom') {
      if (receivedTime < customStart.getTime() || receivedTime > customEnd.getTime()) {
        return false;
      }
    } else if (dashboardMode !== 'unreviewed') {
      if (receivedTime < dashboardWindowStart.getTime()) {
        return false;
      }
    }
    if (dashboardProductCode !== 'All product codes' && shortCode(getField(record, 'Product Code')) !== dashboardProductCode) {
      return false;
    }
    if (dashboardManufacturer !== 'All manufacturers' && getField(record, 'Manufacturer Name') !== dashboardManufacturer) {
      return false;
    }
    if (dashboardEventType !== 'All event types' && getField(record, 'Event Type') !== dashboardEventType) {
      return false;
    }
    if (dashboardBrand !== 'All brands' && getField(record, 'Brand Name') !== dashboardBrand) {
      return false;
    }
    if (dashboardHealthEffect !== 'All health effect codes' && !getField(record, 'Health Effect Clinical Code').includes(dashboardHealthEffect)) {
      return false;
    }
    if (dashboardDeviceProblem !== 'All device problem codes' && !getField(record, 'Device Problem Code').includes(dashboardDeviceProblem)) {
      return false;
    }
    if (dashboardReportSource !== 'All report sources' && getField(record, 'Report Source') !== dashboardReportSource) {
      return false;
    }
    if (dashboardCountry !== 'All countries' && getField(record, 'Reporter Country') !== dashboardCountry) {
      return false;
    }
    if (dashboardRemedialAction !== 'All remedial actions' && getField(record, 'Remedial Action Type') !== dashboardRemedialAction) {
      return false;
    }
    if (dashboardRationalGroup !== 'All rational groups' && record.rationalGroup !== dashboardRationalGroup) {
      return false;
    }
    if (dashboardSummaryReport !== 'All reports' && getField(record, 'Is Summary Report?') !== dashboardSummaryReport) {
      return false;
    }
    if (
      dashboardRecallOnly === 'Recall only' &&
      !/recall|remediation/i.test(`${getField(record, 'Remedial Action Type')} ${getNarrativeBundle(record)} ${record.tags.join(' ')}`)
    ) {
      return false;
    }
    return recordMatchesQuery(record, deferredDashboardPrompt, 'All Fields', true);
  });

  const productCodeOptions = ['All product codes', ...reviewerProfile.productCodes];
  const dashboardManufacturers = ['All manufacturers', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Manufacturer Name')))];
  const dashboardEventTypes = ['All event types', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Event Type')))];
  const dashboardBrands = ['All brands', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Brand Name')))];
  const dashboardHealthEffects = [
    'All health effect codes',
    ...new Set(
      dashboardScopeRecords.map((record) => (getField(record, 'Health Effect Clinical Code') || 'None').split(';')[0].trim()).filter(Boolean),
    ),
  ];
  const dashboardDeviceProblems = [
    'All device problem codes',
    ...new Set(
      dashboardScopeRecords.map((record) => (getField(record, 'Device Problem Code') || 'None').split(';')[0].trim()).filter(Boolean),
    ),
  ];
  const dashboardReportSources = ['All report sources', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Report Source') || 'Manufacturer'))];
  const dashboardCountries = ['All countries', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Reporter Country') || 'USA'))];
  const dashboardRemedialActions = ['All remedial actions', ...new Set(dashboardScopeRecords.map((record) => getField(record, 'Remedial Action Type') || '').filter(Boolean))];
  const dashboardRationalGroups = ['All rational groups', ...new Set(dashboardScopeRecords.map((record) => record.rationalGroup))];

  const routineMix = [
    ['Serious Injury', routineRecords.filter((record) => getField(record, 'Event Type') === 'Serious Injury').length],
    ['Malfunction', routineRecords.filter((record) => getField(record, 'Event Type') === 'Malfunction').length],
    ['Other', routineRecords.filter((record) => getField(record, 'Event Type') === 'Other').length],
  ] as Array<[string, number]>;

  const highPriorityMix = [
    ['Death', highPriorityRecords.filter((record) => getField(record, 'Code Blue Type') === 'Death').length],
    ['Thermal events', highPriorityRecords.filter((record) => getField(record, 'Code Blue Type') === 'Thermal event').length],
    ['Suicide ideation', highPriorityRecords.filter((record) => getField(record, 'Code Blue Type') === 'Suicide ideation').length],
  ] as Array<[string, number]>;

  const issueStatusMix = Object.entries(
    issueItems.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.status] = (acc[issue.status] || 0) + 1;
      return acc;
    }, {}),
  );
  const aiStatusMix = Object.entries(
    aiLetters.reduce<Record<string, number>>((acc, letter) => {
      acc[letter.status] = (acc[letter.status] || 0) + 1;
      return acc;
    }, {}),
  );

  const reporterTypeMix = takeTop(countBy(dashboardRecords, (record) => getField(record, 'Type of Reporter') || 'Manufacturer'), 3);
  const rationalGroupMix = takeTop(countBy(dashboardRecords, (record) => record.rationalGroup), 4);
  const manufacturerMix = takeTop(countBy(dashboardRecords, (record) => getField(record, 'Manufacturer Name')), 6);
  const brandMix = takeTop(countBy(dashboardRecords, (record) => getField(record, 'Brand Name')), 6);
  const healthEffectMix = takeTop(
    countBy(dashboardRecords, (record) => (getField(record, 'Health Effect Clinical Code') || 'None').split(';')[0].trim()),
    6,
  );
  const deviceProblemMix = takeTop(
    countBy(dashboardRecords, (record) => (getField(record, 'Device Problem Code') || 'None').split(';')[0].trim()),
    6,
  );
  const investigationMix = takeTop(
    countBy(dashboardRecords, (record) => (getField(record, 'Investigation Findings Code') || 'None').split(';')[0].trim()),
    6,
  );
  const dashboardProductMix = takeTop(countBy(dashboardRecords, (record) => shortCode(getField(record, 'Product Code'))), 5);
  const dateSeries = buildMonthlySeries(dashboardRecords);
  const today = new Date('2026-03-26T10:05:00-04:00');
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (7 - today.getDay()));
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  const routineDueThisWeek = routineRecords.filter((record) => new Date(record.dueDate) <= weekEnd).length;
  const routineDueThisMonth = routineRecords.filter((record) => new Date(record.dueDate) <= monthEnd).length;
  const hpDueThisWeek = highPriorityRecords.filter((record) => new Date(record.dueDate) <= weekEnd).length;
  const hpDueThisMonth = highPriorityRecords.filter((record) => new Date(record.dueDate) <= monthEnd).length;

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar">
        <div>
          <h1>MDR Review Prototype</h1>
        </div>
        <div className="reviewer-badge">
          <span>{reviewerProfile.name}</span>
          <strong>{reviewerProfile.title}</strong>
          <small>Assigned product codes: {reviewerProfile.productCodes.join(', ')}</small>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={tab === activeTab ? 'tab active' : 'tab'}
            onClick={() => startTransition(() => setActiveTab(tab))}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'Overview' && (
          <section className="panel-stack">
            <section className="metrics-grid">
              <MetricCard label="Routine MDRs in queue" value={routineRecords.length.toLocaleString()} note="Current routine review workload" />
              <MetricCard label="High priority MDRs" value={String(highPriorityRecords.length)} note="Deaths, thermal events, suicide ideation" />
              <MetricCard label="Active issues tracked" value={String(issueItems.length)} note="Longitudinal issue monitoring" />
              <MetricCard label="Open AI letters" value={String(aiLetters.length)} note="Communication items in progress" />
            </section>

            <section className="overview-grid two-by-two">
              <OverviewPanel
                eyebrow="High priority"
                title="Current HP review categories"
                actionLabel="More"
                onAction={() => setActiveTab('High Priority Queue')}
                rows={highPriorityMix}
                chartStyle="donut"
                footer={[
                  ['MDRs due this week', hpDueThisWeek],
                  ['MDRs due this month', hpDueThisMonth],
                ]}
              />
              <OverviewPanel
                eyebrow="Routine queue"
                title="Routine queue mix"
                actionLabel="More"
                onAction={() => setActiveTab('Routine Queue')}
                rows={routineMix}
                chartStyle="donut"
                footer={[
                  ['MDRs due this week', routineDueThisWeek],
                  ['MDRs due this month', routineDueThisMonth],
                ]}
              />
              <OverviewPanel
                eyebrow="Issue tracker"
                title="Issues in progress"
                actionLabel="More"
                onAction={() => setActiveTab('Issue Tracker')}
                rows={issueStatusMix}
                chartStyle="bars"
              />
              <OverviewPanel
                eyebrow="AI letters"
                title="AI letters in progress"
                actionLabel="More"
                onAction={() => setActiveTab('AI Letters')}
                rows={aiStatusMix}
                chartStyle="bars"
              />
            </section>
          </section>
        )}

        {activeTab === 'Dashboard' && (
          <section className="panel-stack">
            <section className="dashboard-toolbar">
              <div className="dashboard-title">
                <p className="eyebrow">Dashboard</p>
                <h2>MDR analytics workspace</h2>
              </div>
              <div className="pill-row">
                {DASHBOARD_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    className={mode.id === dashboardMode ? 'pill active' : 'pill'}
                    onClick={() => setDashboardMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </section>

            {dashboardMode === 'custom' && (
              <section className="dashboard-date-range-card">
                <div className="date-range-grid">
                  <label>
                    <span>Start date</span>
                    <input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} />
                  </label>
                  <label>
                    <span>End date</span>
                    <input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} />
                  </label>
                </div>
              </section>
            )}

            <section className="dashboard-prompt-card">
              <div className="prompt-copy">
                <p className="eyebrow">Natural-language analytics</p>
                <h3>Describe what you want to see</h3>
              </div>
              <div className="prompt-controls">
                <input
                  value={dashboardPrompt}
                  onChange={(event) => setDashboardPrompt(event.target.value)}
                  placeholder="Example: show thermal event trends for TMV in my current queue over the last 90 days"
                />
                <div className="pill-row wrap">
                  {SAMPLE_PROMPTS.map((prompt) => (
                    <button key={prompt} className="pill" onClick={() => setDashboardPrompt(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="dashboard-filter-panel card">
              <div className="dashboard-filter-header">
                <div>
                  <p className="eyebrow">MDR Filters</p>
                </div>
                <div className="pill-row wrap">
                  <button className="text-button" onClick={() => setShowMoreDashboardFilters((current) => !current)}>
                    {showMoreDashboardFilters ? 'Show fewer filters' : 'Show more filters'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDashboardScope('Current queue');
                      setDashboardProductCode('All product codes');
                      setDashboardManufacturer('All manufacturers');
                      setDashboardEventType('All event types');
                      setDashboardBrand('All brands');
                      setDashboardHealthEffect('All health effect codes');
                      setDashboardDeviceProblem('All device problem codes');
                      setDashboardReportSource('All report sources');
                      setDashboardCountry('All countries');
                      setDashboardRemedialAction('All remedial actions');
                      setDashboardRationalGroup('All rational groups');
                      setDashboardSummaryReport('All reports');
                      setDashboardRecallOnly('All');
                      setDashboardPrompt('');
                    }}
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
              <div className="dashboard-filter-grid">
                <label>
                  <span>Scope</span>
                  <select value={dashboardScope} onChange={(event) => setDashboardScope(event.target.value as typeof dashboardScope)}>
                    <option>Current queue</option>
                    <option>Routine queue</option>
                    <option>High priority queue</option>
                    <option>All assigned product codes</option>
                  </select>
                </label>
                <label>
                  <span>Product code</span>
                  <select value={dashboardProductCode} onChange={(event) => setDashboardProductCode(event.target.value)}>
                    {productCodeOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Manufacturer</span>
                  <select value={dashboardManufacturer} onChange={(event) => setDashboardManufacturer(event.target.value)}>
                    {dashboardManufacturers.map((manufacturer) => (
                      <option key={manufacturer} value={manufacturer}>
                        {manufacturer}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Event type</span>
                  <select value={dashboardEventType} onChange={(event) => setDashboardEventType(event.target.value)}>
                    {dashboardEventTypes.map((eventType) => (
                      <option key={eventType} value={eventType}>
                        {eventType}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quick filter</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        setDashboardPrompt(event.target.value);
                      }
                    }}
                  >
                    <option value="">Choose</option>
                    <option value="device problem code material integrity problem">Device problems</option>
                    <option value="health effect skin irritation rash blister">Health effects</option>
                    <option value="summary report yes">Summary reports</option>
                    <option value="reporter type medsun facility">MedSun / facility</option>
                  </select>
                </label>
                {showMoreDashboardFilters && (
                  <>
                    <label>
                      <span>Brand</span>
                      <select value={dashboardBrand} onChange={(event) => setDashboardBrand(event.target.value)}>
                        {dashboardBrands.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Health effect code</span>
                      <select value={dashboardHealthEffect} onChange={(event) => setDashboardHealthEffect(event.target.value)}>
                        {dashboardHealthEffects.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Device problem code</span>
                      <select value={dashboardDeviceProblem} onChange={(event) => setDashboardDeviceProblem(event.target.value)}>
                        {dashboardDeviceProblems.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Report source / MedSun</span>
                      <select value={dashboardReportSource} onChange={(event) => setDashboardReportSource(event.target.value)}>
                        {dashboardReportSources.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Reporter country</span>
                      <select value={dashboardCountry} onChange={(event) => setDashboardCountry(event.target.value)}>
                        {dashboardCountries.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Remedial action / recall</span>
                      <select value={dashboardRemedialAction} onChange={(event) => setDashboardRemedialAction(event.target.value)}>
                        {dashboardRemedialActions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Rational group</span>
                      <select value={dashboardRationalGroup} onChange={(event) => setDashboardRationalGroup(event.target.value)}>
                        {dashboardRationalGroups.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Summary report</span>
                      <select value={dashboardSummaryReport} onChange={(event) => setDashboardSummaryReport(event.target.value)}>
                        <option>All reports</option>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </label>
                    <label>
                      <span>Recall</span>
                      <select value={dashboardRecallOnly} onChange={(event) => setDashboardRecallOnly(event.target.value)}>
                        <option>All</option>
                        <option>Recall only</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            </section>

            <article className="card dashboard-hero">
              <div className="dashboard-kpis">
                <div className="summary-stat">
                  <span>Total MDRs</span>
                  <strong>{dashboardRecords.length.toLocaleString()}</strong>
                </div>
                <div className="summary-stat">
                  <span>Total events</span>
                  <strong>{sumEvents(dashboardRecords).toLocaleString()}</strong>
                </div>
                <div className="summary-stat">
                  <span>Manufacturers</span>
                  <strong>{new Set(dashboardRecords.map((record) => getField(record, 'Manufacturer Name'))).size}</strong>
                </div>
                <div className="summary-stat">
                  <span>Updated</span>
                  <strong>{reviewerProfile.updatedAt.split(' ')[0]}</strong>
                </div>
              </div>
            </article>

            <section className="dashboard-top-grid">
              <article className="card compact-card">
                <p className="eyebrow">Product codes</p>
                <h3>Top product codes</h3>
                <DonutCard rows={dashboardProductMix} />
              </article>
              <article className="card compact-card">
                <p className="eyebrow">Event type</p>
                <h3>Event mix</h3>
                <DonutCard rows={takeTop(countBy(dashboardRecords, (record) => getField(record, 'Event Type')), 4)} />
              </article>
              <article className="card compact-card">
                <p className="eyebrow">Reporter type</p>
                <h3>Reporter mix</h3>
                <DonutCard rows={reporterTypeMix} />
              </article>
              <article className="card compact-card">
                <p className="eyebrow">Rational groups</p>
                <h3>Top rational groups</h3>
                <DonutCard rows={rationalGroupMix} />
              </article>
            </section>

            <article className="card wide-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Date received</p>
                  <h3>Trend over time</h3>
                </div>
              </div>
              <LineChart data={dateSeries} />
            </article>

            <section className="dashboard-bottom-grid">
              <DataListCard title="Manufacturer" rows={manufacturerMix} />
              <DataListCard title="Brand" rows={brandMix} />
              <DataListCard title="Health Effect Clinical Codes" rows={healthEffectMix} />
              <DataListCard title="Device Problem Codes" rows={deviceProblemMix} />
              <DataListCard title="Investigation Findings Codes" rows={investigationMix} />
            </section>
          </section>
        )}

        {activeTab === 'Routine Queue' && (
          <QueueView
            title="Routine queue"
            eyebrow="Routine queue"
            description="Routine MDRs grouped for aggregate review. Use the table for readable bulk review and export-compatible subsets."
            records={filteredRoutineQueue}
            searchValue={routineSearch}
            onSearchChange={setRoutineSearch}
            searchPlaceholder="Semantic filter across routine narratives, manufacturers, brands, and codes"
            manufacturerValue={routineManufacturer}
            onManufacturerChange={setRoutineManufacturer}
            manufacturers={routineManufacturers}
            secondaryFilterValue={routineEventType}
            onSecondaryFilterChange={setRoutineEventType}
            secondaryFilterOptions={routineEventTypes}
            secondaryFilterLabel="Event type"
            visibleColumns={routineVisibleColumns}
            onToggleColumn={(column) =>
              setRoutineVisibleColumns((current) =>
                current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
              )
            }
            expandedRows={routineExpanded}
            onToggleExpanded={() => setRoutineExpanded((current) => !current)}
            showAllColumns={routineShowAllColumns}
            onToggleShowAllColumns={() => setRoutineShowAllColumns((current) => !current)}
            selectedIds={routineSelectedIds}
            onToggleSelected={(id) =>
              setRoutineSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
            }
            onToggleSelectAll={() =>
              setRoutineSelectedIds((current) =>
                current.length === filteredRoutineQueue.length ? [] : filteredRoutineQueue.map((record) => record.id),
              )
            }
            onBatchAction={(action, count) =>
              setActionMessage(
                action === 'issue'
                  ? `${count} routine MDRs added to a draft issue-based review.`
                  : `${count} routine MDRs flagged for follow-up.`,
              )
            }
            onOpenIssue={(issueId) => {
              setSelectedIssueId(issueId);
              setActiveTab('Issue Tracker');
            }}
            onOpenAi={() => setActiveTab('AI Letters')}
            exportName="routine-queue-export.csv"
          />
        )}

        {activeTab === 'High Priority Queue' && (
          <QueueView
            title="High priority queue"
            eyebrow="High priority queue"
            description="High-priority MDRs remain individually reviewable, but this view keeps batch visibility for death, thermal, and suicide-ideation categories."
            records={filteredHighPriorityQueue}
            searchValue={hpSearch}
            onSearchChange={setHpSearch}
            searchPlaceholder="Semantic filter across HP narratives, code-blue type, and manufacturers"
            manufacturerValue={hpManufacturer}
            onManufacturerChange={setHpManufacturer}
            manufacturers={hpManufacturers}
            secondaryFilterValue={hpCategory}
            onSecondaryFilterChange={setHpCategory}
            secondaryFilterOptions={hpCategories}
            secondaryFilterLabel="HP category"
            visibleColumns={hpVisibleColumns}
            onToggleColumn={(column) =>
              setHpVisibleColumns((current) =>
                current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
              )
            }
            expandedRows={hpExpanded}
            onToggleExpanded={() => setHpExpanded((current) => !current)}
            showAllColumns={hpShowAllColumns}
            onToggleShowAllColumns={() => setHpShowAllColumns((current) => !current)}
            selectedIds={hpSelectedIds}
            onToggleSelected={(id) =>
              setHpSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
            }
            onToggleSelectAll={() =>
              setHpSelectedIds((current) =>
                current.length === filteredHighPriorityQueue.length ? [] : filteredHighPriorityQueue.map((record) => record.id),
              )
            }
            onBatchAction={(action, count) =>
              setActionMessage(
                action === 'issue'
                  ? `${count} high-priority MDRs added to a draft issue-based review.`
                  : `${count} high-priority MDRs flagged for follow-up.`,
              )
            }
            onOpenIssue={(issueId) => {
              setSelectedIssueId(issueId);
              setActiveTab('Issue Tracker');
            }}
            onOpenAi={() => setActiveTab('AI Letters')}
            exportName="high-priority-queue-export.csv"
          />
        )}

        {activeTab === 'Search' && (
          <section className="panel-stack">
            <section className="section-header">
              <div>
                <h2>Search</h2>
              </div>
              <button className="primary-button" onClick={() => downloadCsv(searchResults, 'mdr-search-results.csv')}>
                Export search results
              </button>
            </section>

            <section className="search-layout">
              <article className="card search-panel">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Semantic search</p>
                    <h3>Search in meaning, not exact wording</h3>
                  </div>
                  <span className="severity severity-medium">Semantic mode on</span>
                </div>
                <div className="search-controls">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Describe the complaint pattern or narrative concept you want to find"
                  />
                  <select value={searchField} onChange={(event) => setSearchField(event.target.value as typeof searchField)}>
                    {SEARCHABLE_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pill-row wrap">
                  {SAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      className="pill"
                      onClick={() =>
                        startTransition(() => {
                          setSearchField('All Fields');
                          setSearchQuery(prompt);
                        })
                      }
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </article>

              <article className="card search-panel">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Structured search</p>
                    <h3>Key terms and filters</h3>
                  </div>
                  <button className="text-button" onClick={() => setShowAdvancedSearch((current) => !current)}>
                    {showAdvancedSearch ? 'Hide advanced search' : 'Advanced search'}
                  </button>
                </div>
                <div className="dashboard-filter-grid search-filter-grid">
                  <label>
                    <span>Device / product code</span>
                    <select value={structuredProductCode} onChange={(event) => setStructuredProductCode(event.target.value)}>
                      {searchProductCodes.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Manufacturer</span>
                    <select value={structuredManufacturer} onChange={(event) => setStructuredManufacturer(event.target.value)}>
                      {searchManufacturers.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Device problem code</span>
                    <select value={structuredProblemCode} onChange={(event) => setStructuredProblemCode(event.target.value)}>
                      {searchProblemCodes.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Start date</span>
                    <input type="date" value={structuredStartDate} onChange={(event) => setStructuredStartDate(event.target.value)} />
                  </label>
                  <label>
                    <span>End date</span>
                    <input type="date" value={structuredEndDate} onChange={(event) => setStructuredEndDate(event.target.value)} />
                  </label>
                </div>
                {showAdvancedSearch && (
                  <div className="advanced-search-panel">
                    <div className="card-header">
                      <div>
                        <p className="eyebrow">Advanced search</p>
                        <h3>Add any MDR field</h3>
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setAdvancedFilters((current) => [
                            ...current,
                            { id: `advanced-${current.length + 1}`, field: 'Brand Name', value: '' },
                          ])
                        }
                      >
                        Add field
                      </button>
                    </div>
                    <div className="advanced-filter-list">
                      {advancedFilters.map((filter) => (
                        <div key={filter.id} className="advanced-filter-row">
                          <select
                            value={filter.field}
                            onChange={(event) =>
                              setAdvancedFilters((current) =>
                                current.map((item) =>
                                  item.id === filter.id ? { ...item, field: event.target.value as MdrHeader } : item,
                                ),
                              )
                            }
                          >
                            {MDR_HEADERS.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                          <input
                            value={filter.value}
                            onChange={(event) =>
                              setAdvancedFilters((current) =>
                                current.map((item) => (item.id === filter.id ? { ...item, value: event.target.value } : item)),
                              )
                            }
                            placeholder="Contains..."
                          />
                          <button
                            className="text-button"
                            onClick={() => setAdvancedFilters((current) => current.filter((item) => item.id !== filter.id))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </section>

            <section className="dashboard-grid">
              <article className="card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Saved searches</p>
                    <h3>Reusable search patterns</h3>
                  </div>
                </div>
                <div className="alert-list">
                  {savedSearches.map((search) => (
                    <button
                      key={search.id}
                      className="alert-item"
                      onClick={() => {
                        setSearchField(search.scope);
                        setSearchQuery(search.query);
                      }}
                    >
                      <div>
                        <strong>{search.title}</strong>
                        <p>{search.description}</p>
                      </div>
                      <span className="severity severity-medium">{search.mode}</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Result analytics</p>
                    <h3>Immediate search summary</h3>
                  </div>
                </div>
                <div className="stacked-list">
                  <div className="list-row">
                    <span>Matching MDRs</span>
                    <strong>{searchResults.length.toLocaleString()}</strong>
                  </div>
                  <div className="list-row">
                    <span>High priority in results</span>
                    <strong>{searchResults.filter((record) => record.priority === 'High Priority').length.toLocaleString()}</strong>
                  </div>
                  <div className="list-row">
                    <span>Manufacturers represented</span>
                    <strong>{new Set(searchResults.map((record) => getField(record, 'Manufacturer Name'))).size}</strong>
                  </div>
                  <div className="list-row">
                    <span>Issue-linked results</span>
                    <strong>{searchResults.filter((record) => record.linkedIssueIds.length > 0).length.toLocaleString()}</strong>
                  </div>
                </div>
              </article>
            </section>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Report Number</th>
                    <th>Manufacturer Name</th>
                    <th>Brand Name</th>
                    <th>Event Type</th>
                    <th>Search-relevant text</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((record) => (
                    <tr key={record.id}>
                      <td>{getField(record, 'Report Number')}</td>
                      <td>{getField(record, 'Manufacturer Name')}</td>
                      <td>{getField(record, 'Brand Name')}</td>
                      <td>{getField(record, 'Event Type')}</td>
                      <td>
                        <div className="search-snippet">{getNarrativeBundle(record).slice(0, 280)}...</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'Issue Tracker' && (
          <section className="panel-stack">
            <section className="section-header">
              <div>
                <p className="eyebrow">Issue tracker</p>
                <h2>Longitudinal monitoring lives here</h2>
                <p className="subdued">
                  Reviewers can keep issues active after the parent MDR review closes, attach saved monitoring logic, and see
                  new linked complaints without rebuilding the same search each cycle.
                </p>
              </div>
            </section>

            <section className="issue-layout">
              <div className="issue-list">
                {issueItems.map((issue) => (
                  <button
                    key={issue.id}
                    className={issue.id === selectedIssue.id ? 'issue-card selected' : 'issue-card'}
                    onClick={() => setSelectedIssueId(issue.id)}
                  >
                    <div className="issue-card-top">
                      <strong>{issue.title}</strong>
                      <span className={`severity severity-${issue.severity.toLowerCase()}`}>{issue.severity}</span>
                    </div>
                    <p>{issue.alertSummary}</p>
                    <small>
                      {issue.status} · {issue.cadence}
                    </small>
                  </button>
                ))}
              </div>

              <div className="issue-detail">
                <article className="card">
                  <div className="card-header">
                    <div>
                      <p className="eyebrow">Selected issue</p>
                      <h3>{selectedIssue.title}</h3>
                    </div>
                    {selectedIssueLetters.length > 0 && (
                      <button className="text-button" onClick={() => setActiveTab('AI Letters')}>
                        Open communication
                      </button>
                    )}
                  </div>
                  <div className="stacked-list">
                    <div className="list-row">
                      <span>Status</span>
                      <strong>{selectedIssue.status}</strong>
                    </div>
                    <div className="list-row">
                      <span>Monitoring cadence</span>
                      <strong>{selectedIssue.cadence}</strong>
                    </div>
                    <div className="list-row">
                      <span>Owner</span>
                      <strong>{selectedIssue.owner}</strong>
                    </div>
                    <div className="list-row">
                      <span>Last updated</span>
                      <strong>{selectedIssue.lastUpdated}</strong>
                    </div>
                  </div>
                  <div className="details-panel">
                    <p>
                      <strong>Focus:</strong> {selectedIssue.focus}
                    </p>
                    <p>
                      <strong>Monitoring query:</strong> {selectedIssue.monitoringQuery}
                    </p>
                    <p>
                      <strong>Notes:</strong> {selectedIssue.notes}
                    </p>
                  </div>
                </article>

                <article className="card">
                  <div className="card-header">
                    <div>
                      <p className="eyebrow">Linked MDRs</p>
                      <h3>Representative evidence set</h3>
                    </div>
                  </div>
                  <div className="due-list">
                    {selectedIssueRecords.map((record) => (
                      <div key={record.id} className="due-row">
                        <div>
                          <strong>{getField(record, 'Report Number')}</strong>
                          <p>
                            {getField(record, 'Manufacturer Name')} · {getField(record, 'Event Type')}
                          </p>
                        </div>
                        <span>{record.priority}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>
          </section>
        )}

        {activeTab === 'AI Letters' && (
          <section className="panel-stack">
            <section className="section-header">
              <div>
                <p className="eyebrow">AI letters</p>
                <h2>Communication is part of the same lifecycle</h2>
                <p className="subdued">
                  Drafting, sent status, AIR review, and follow-up next steps stay attached to the underlying issue rather than
                  living in separate email chains and spreadsheets.
                </p>
              </div>
            </section>

            <section className="metrics-grid compact">
              <MetricCard label="Drafting" value={String(aiLetters.filter((letter) => letter.status === 'Drafting').length)} note="Questions being prepared" />
              <MetricCard label="Sent / awaiting AIR" value={String(aiLetters.filter((letter) => letter.status === 'Sent').length)} note="Response deadlines tracked in-system" />
              <MetricCard label="AIR received" value={String(aiLetters.filter((letter) => letter.status === 'AIR Received').length)} note="Ready for reviewer disposition" />
            </section>

            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>AI Letter</th>
                    <th>Manufacturer</th>
                    <th>Status</th>
                    <th>Response Due</th>
                    <th>Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  {aiLetters.map((letter) => (
                    <tr key={letter.id}>
                      <td>
                        <strong>{letter.subject}</strong>
                        <div className="sub-cell">{letter.id}</div>
                      </td>
                      <td>{letter.manufacturer}</td>
                      <td>
                        <span className={`badge ${letter.status === 'Sent' ? 'danger' : 'neutral'}`}>{letter.status}</span>
                      </td>
                      <td>{letter.responseDue}</td>
                      <td>{letter.nextStep}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'Documentation' && (
          <section className="panel-stack">
            <section className="section-header">
              <div>
                <p className="eyebrow">Documentation</p>
                <h2>Structured review output with linked issue and communication context</h2>
                <p className="subdued">
                  This tab stays intentionally lightweight in v1. The goal is to show where review notes, monitoring rationale,
                  and communication history converge.
                </p>
              </div>
            </section>

            <section className="dashboard-grid">
              <article className="card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Current routine review</p>
                    <h3>March 2026 mixed-code monthly review</h3>
                  </div>
                </div>
                <div className="details-panel">
                  <p>
                    <strong>Scope:</strong> Assigned routine queue across BZD, QNX, LPR, and TMV plus tracked monitoring items.
                  </p>
                  <p>
                    <strong>Disposition summary:</strong> Close routine review on time, keep skin injury, thermal, magnetic, and
                    pressure-injury issues active, and maintain AI follow-up where firm communication is open.
                  </p>
                </div>
              </article>

              <article className="card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Linked artifacts</p>
                    <h3>Traceability</h3>
                  </div>
                </div>
                <div className="stacked-list">
                  <div className="list-row">
                    <span>Open issue trackers</span>
                    <strong>{issueItems.length}</strong>
                  </div>
                  <div className="list-row">
                    <span>AI letters linked</span>
                    <strong>{aiLetters.length}</strong>
                  </div>
                  <div className="list-row">
                    <span>Export-compatible datasets</span>
                    <strong>Queue + Search</strong>
                  </div>
                </div>
              </article>

              <article className="card">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Design principle</p>
                    <h3>Reduce dependence on macros without a hard cutover</h3>
                  </div>
                </div>
                <p className="card-note">
                  Export remains available anywhere a reviewer sees a result set. The future-state system is meant to earn trust by
                  making the web workflow better, not by removing the current safety net on day one.
                </p>
              </article>
            </section>
          </section>
        )}
      </main>
      {actionMessage && (
        <div className="toast-message" onClick={() => setActionMessage('')}>
          {actionMessage}
        </div>
      )}
    </div>
  );
}

function QueueView({
  title,
  eyebrow,
  description,
  records,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  manufacturerValue,
  onManufacturerChange,
  manufacturers,
  secondaryFilterValue,
  onSecondaryFilterChange,
  secondaryFilterOptions,
  secondaryFilterLabel,
  visibleColumns,
  onToggleColumn,
  expandedRows,
  onToggleExpanded,
  showAllColumns,
  onToggleShowAllColumns,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  onBatchAction,
  onOpenIssue,
  onOpenAi,
  exportName,
}: {
  title: string;
  eyebrow: string;
  description: string;
  records: MdrRecord[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  manufacturerValue: string;
  onManufacturerChange: (value: string) => void;
  manufacturers: string[];
  secondaryFilterValue: string;
  onSecondaryFilterChange: (value: string) => void;
  secondaryFilterOptions: string[];
  secondaryFilterLabel: string;
  visibleColumns: MdrHeader[];
  onToggleColumn: (column: MdrHeader) => void;
  expandedRows: boolean;
  onToggleExpanded: () => void;
  showAllColumns: boolean;
  onToggleShowAllColumns: () => void;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: () => void;
  onBatchAction: (action: 'issue' | 'flag', count: number) => void;
  onOpenIssue: (issueId: string) => void;
  onOpenAi: () => void;
  exportName: string;
}) {
  const allSelected = records.length > 0 && selectedIds.length === records.length;
  const pickerColumns = showAllColumns ? MDR_HEADERS.filter((column) => column !== 'Report Number') : QUICK_COLUMN_CHOICES;

  return (
    <section className="panel-stack">
      <section className="section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="subdued">{description}</p>
        </div>
        <button className="primary-button" onClick={() => downloadCsv(records, exportName)}>
          Export current result set
        </button>
      </section>

      <section className="filter-bar">
        <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} />
        <select value={manufacturerValue} onChange={(event) => onManufacturerChange(event.target.value)}>
          {manufacturers.map((manufacturer) => (
            <option key={manufacturer} value={manufacturer}>
              {manufacturer}
            </option>
          ))}
        </select>
        <select value={secondaryFilterValue} onChange={(event) => onSecondaryFilterChange(event.target.value)}>
          {secondaryFilterOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="queue-filter-label">{secondaryFilterLabel}</div>
      </section>

      <section className="metrics-grid compact">
        <MetricCard label="Rows in view" value={records.length.toLocaleString()} note="Readable directly in the browser" />
        <MetricCard label="Manufacturers" value={String(new Set(records.map((record) => getField(record, 'Manufacturer Name'))).size)} note="Varied dummy data across manufacturers" />
        <MetricCard label="Issue-linked rows" value={String(records.filter((record) => record.linkedIssueIds.length > 0).length)} note="Can jump into tracked issues" />
      </section>

      <section className="queue-action-bar">
        <div className="pill-row wrap">
          <button className={expandedRows ? 'pill active' : 'pill'} onClick={onToggleExpanded}>
            {expandedRows ? 'Collapse narratives' : 'Expand narratives'}
          </button>
          <button className="pill" onClick={() => onBatchAction('issue', selectedIds.length)} disabled={selectedIds.length === 0}>
            Add selected to issue review
          </button>
          <button className="pill" onClick={() => onBatchAction('flag', selectedIds.length)} disabled={selectedIds.length === 0}>
            Flag selected
          </button>
        </div>
        <strong>{selectedIds.length} selected</strong>
      </section>

      <section className="column-picker">
        <div className="column-picker-header">
          <span>Visible columns</span>
          <button className="text-button" onClick={onToggleShowAllColumns}>
            {showAllColumns ? 'Show fewer' : 'Show more'}
          </button>
        </div>
        <div className="pill-row wrap">
          {pickerColumns.map((column) => (
            <button key={column} className={visibleColumns.includes(column) ? 'pill active' : 'pill'} onClick={() => onToggleColumn(column)}>
              {column}
            </button>
          ))}
        </div>
      </section>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
              </th>
              <th>Report Number</th>
              <th>Workflow</th>
              {visibleColumns
                .filter((column) => column !== 'Report Number')
                .map((column) => (
                  <th key={column}>{column}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <Fragment key={record.id}>
                <tr key={record.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => onToggleSelected(record.id)}
                    />
                  </td>
                  <td>
                    <div className="cell-value">{getField(record, 'Report Number') || '—'}</div>
                  </td>
                  <td className="action-cell">
                    <span className={`badge ${record.priority === 'High Priority' ? 'danger' : 'neutral'}`}>{record.priority}</span>
                    <small>{record.reviewStatus}</small>
                    {!expandedRows && (
                      <details>
                        <summary>Show more</summary>
                        <div className="details-panel">
                          <p>
                            <strong>Event description:</strong> {getField(record, 'Event Description')}
                          </p>
                          <p>
                            <strong>Manufacturer narrative:</strong> {getField(record, 'Manufacturer Narrative') || '—'}
                          </p>
                        </div>
                      </details>
                    )}
                    <button className="link-button" onClick={() => onOpenIssue(record.linkedIssueIds[0])}>
                      Open issue tracker
                    </button>
                    {record.linkedLetterIds.length > 0 && (
                      <button className="link-button" onClick={onOpenAi}>
                        Open AI letter
                      </button>
                    )}
                  </td>
                  {visibleColumns
                    .filter((column) => column !== 'Report Number')
                    .map((column) => (
                      <td key={`${record.id}-${column}`}>
                        <div className="cell-value">
                          {column === 'Product Code'
                            ? shortCode(getField(record, column))
                            : NARRATIVE_FIELDS.includes(column)
                              ? expandedRows
                                ? getField(record, column) || '—'
                                : 'Hidden until expanded'
                              : getField(record, column) || '—'}
                        </div>
                      </td>
                    ))}
                </tr>
                {expandedRows && (
                  <tr className="expanded-row">
                    <td />
                    <td colSpan={visibleColumns.length + 2}>
                      <div className="expanded-grid">
                        <div className="details-panel">
                          <p>
                            <strong>Event description:</strong> {getField(record, 'Event Description')}
                          </p>
                          <p>
                            <strong>Manufacturer narrative:</strong> {getField(record, 'Manufacturer Narrative') || '—'}
                          </p>
                        </div>
                        <div className="details-panel">
                          <p>
                            <strong>MedSun narrative:</strong> {getField(record, 'MedSun Narrative') || '—'}
                          </p>
                          <p>
                            <strong>Medical history:</strong> {getField(record, 'Medical History') || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function OverviewPanel({
  eyebrow,
  title,
  rows,
  actionLabel,
  onAction,
  chartStyle,
  footer,
}: {
  eyebrow: string;
  title: string;
  rows: Array<[string, number]>;
  actionLabel: string;
  onAction: () => void;
  chartStyle: 'donut' | 'bars';
  footer?: Array<[string, number]>;
}) {
  return (
    <article className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button className="text-button" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      {chartStyle === 'donut' ? <DonutCard rows={rows} compact /> : <MiniBarChart rows={rows} />}
      {footer && (
        <div className="overview-footer">
          {footer.map(([label, value]) => (
            <div key={label} className="footer-stat">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DonutCard({ rows, compact = false }: { rows: Array<[string, number]>; compact?: boolean }) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0) || 1;
  const palette = ['#173d42', '#d26f36', '#58a497', '#c8b58d', '#6f7e84'];
  let running = 0;
  const segments = rows.map(([, value], index) => {
    const start = running;
    const share = (value / total) * 100;
    running += share;
    return `${palette[index % palette.length]} ${start}% ${running}%`;
  });

  return (
    <div className={compact ? 'donut-card compact-donut' : 'donut-card'}>
      <div className="donut" style={{ background: `conic-gradient(${segments.join(', ')})` }}>
        <div className="donut-hole">
          <strong>{total}</strong>
          <span>MDRs</span>
        </div>
      </div>
      <div className="stacked-list">
        {rows.map(([label, value], index) => (
          <div key={label} className="legend-row">
            <span className="legend-chip" style={{ background: palette[index % palette.length] }} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBarChart({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(...rows.map(([, value]) => value), 1);

  return (
    <div className="mini-bar-chart">
      {rows.map(([label, value], index) => (
        <div key={label} className="mini-bar-row">
          <div className="mini-bar-head">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${index % 2 === 0 ? 'dark' : 'warm'}`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildMonthlySeries(records: MdrRecord[]) {
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    const date = parseDate(getField(record, 'FDA Received Date'));
    const label = date.toLocaleString('en-US', { month: 'short' });
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((label) => ({
    label,
    value: counts[label] || 0,
  }));
}

function LineChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((point) => point.value), 1);
  const mean = data.reduce((sum, point) => sum + point.value, 0) / data.length;
  const points = data
    .map((point, index) => {
      const x = 30 + index * 110;
      const y = 180 - (point.value / max) * 140;
      return `${x},${y}`;
    })
    .join(' ');
  const meanY = 180 - (mean / max) * 140;

  return (
    <div className="line-chart-card">
      <svg viewBox="0 0 620 220" className="line-chart">
        <line x1="20" y1={meanY} x2="590" y2={meanY} className="mean-line" />
        <polyline fill="none" stroke="#d26f36" strokeWidth="4" points={points} />
        {data.map((point, index) => {
          const x = 30 + index * 110;
          const y = 180 - (point.value / max) * 140;
          return (
            <g key={point.label}>
              <circle cx={x} cy={y} r="5" fill="#173d42" />
              <text x={x} y="204" textAnchor="middle" className="line-chart-label">
                {point.label}
              </text>
              <text x={x} y={y - 12} textAnchor="middle" className="line-chart-value">
                {point.value}
              </text>
            </g>
          );
        })}
        <text x="586" y={meanY - 8} textAnchor="end" className="line-chart-mean">
          Mean {mean.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

function DataListCard({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <article className="card data-list-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="stacked-list">
        {rows.map(([label, value]) => (
          <div key={label} className="list-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}
