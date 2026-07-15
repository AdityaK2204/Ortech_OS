import type { Project, Task, PointMark } from '../types';

// Per-task accent colors, consistent across the app.
const COLORS = {
  trenching: '#f59e0b', // amber
  pipe: '#3b82f6', // blue
  refill: '#8b5cf6', // violet
  cable: '#ec4899', // pink
  chamber: '#0d9488', // teal
  splice: '#f43f5e', // rose
  marker: '#64748b', // slate
};

// Helper: evenly spread point installations along a route, marking the first
// `doneCount` of them as complete.
function spreadPoints(total: number, doneCount: number, length: number): PointMark[] {
  const gap = length / (total + 1);
  return Array.from({ length: total }, (_, i) => ({
    chainage: Math.round(gap * (i + 1)),
    done: i < doneCount,
  }));
}

// Builds the standard 7-task set for a site. Pass completed spans / counts.
function buildTasks(
  length: number,
  cfg: {
    trench: [number, number][];
    pipe: [number, number][];
    refill: [number, number][];
    cable: [number, number][];
    chamber: [number, number]; // [total, done]
    splice: [number, number];
    marker: [number, number];
  }
): Task[] {
  const seg = (spans: [number, number][]) =>
    spans.map(([start, end]) => ({ start, end }));
  return [
    { id: 't1', name: 'Trenching', type: 'linear', unit: 'm', color: COLORS.trenching, segments: seg(cfg.trench) },
    { id: 't2', name: 'Pipe Laying', type: 'linear', unit: 'm', color: COLORS.pipe, segments: seg(cfg.pipe) },
    { id: 't3', name: 'Refilling / Closing', type: 'linear', unit: 'm', color: COLORS.refill, segments: seg(cfg.refill) },
    { id: 't4', name: 'Cable Pulling', type: 'linear', unit: 'm', color: COLORS.cable, segments: seg(cfg.cable) },
    { id: 't5', name: 'Chamber Installation', type: 'point', unit: 'nos', color: COLORS.chamber, targetCount: cfg.chamber[0], points: spreadPoints(cfg.chamber[0], cfg.chamber[1], length) },
    { id: 't6', name: 'Splicing', type: 'point', unit: 'nos', color: COLORS.splice, targetCount: cfg.splice[0], points: spreadPoints(cfg.splice[0], cfg.splice[1], length) },
    { id: 't7', name: 'Route Marker Installation', type: 'point', unit: 'nos', color: COLORS.marker, targetCount: cfg.marker[0], points: spreadPoints(cfg.marker[0], cfg.marker[1], length) },
  ];
}

function schedule(points: [string, number, number][]) {
  return points.map(([day, projectedPct, actualPct]) => ({ day, projectedPct, actualPct }));
}

export const PROJECTS: Project[] = [
  // ---------------------------------------------------------------- FLAGSHIP 1
  {
    id: 'blr-orr-p3',
    name: 'ORR Phase-3 Fiber Backbone',
    client: 'Jio Digital Infra',
    location: 'Outer Ring Road, Bengaluru',
    cluster: 'Bengaluru South',
    difficulty: 'hard',
    totalLengthMeters: 1500,
    route: {
      id: 'route-blr-orr-p3',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.696, 12.952],
          [77.7005, 12.9548],
          [77.705, 12.9575],
          [77.7092, 12.9602],
          [77.713, 12.9635],
        ],
      },
    },
    startDate: '2026-05-04',
    endDate: '2026-08-15',
    status: 'at_risk',
    lastUpdate: '2026-07-11T17:42:00',
    // Trenching leads; each following task trails behind it — a realistic wavefront.
    tasks: buildTasks(1500, {
      trench: [
        [0, 200],
        [300, 500], // gap 200-300 (rock / pending permission)
        [500, 950],
        [1050, 1200], // gap 950-1050 (road crossing)
      ],
      pipe: [
        [0, 200],
        [300, 500],
        [500, 820],
      ],
      refill: [
        [0, 200],
        [300, 480],
      ],
      cable: [
        [0, 200],
        [300, 420],
      ],
      chamber: [12, 7],
      splice: [10, 4],
      marker: [30, 16],
    }),
    team: {
      supervisor: { name: 'Manoj Reddy', phone: '+91 98450 11223', adherencePct: 82 },
      siteEngineer: { name: 'Anjali Verma', phone: '+91 98860 44556' },
      workers: [
        { name: 'Trenching crew', trade: 'Excavation', count: 6 },
        { name: 'Pipe & duct crew', trade: 'HDD / laying', count: 4 },
        { name: 'Splicing team', trade: 'OFC splicing', count: 2 },
        { name: 'General labour', trade: 'Refill / restore', count: 5 },
      ],
    },
    machines: [
      { id: 'EXC-204', type: 'JCB 3DX Excavator', assignedSince: '2026-05-04', dieselTodayL: 58, dieselBaselineL: 48, utilizationPct: 88, status: 'active' },
      { id: 'HDD-011', type: 'Horizontal Directional Drill', assignedSince: '2026-05-20', dieselTodayL: 41, dieselBaselineL: 44, utilizationPct: 71, status: 'active' },
      { id: 'CMP-006', type: 'Air Compressor', assignedSince: '2026-06-01', dieselTodayL: 0, dieselBaselineL: 12, utilizationPct: 34, status: 'idle' },
    ],
    finance: {
      currency: '₹',
      contractValue: 21_000_000,
      day: { projectedValue: 210_000, actualValue: 168_000, projectedQty: 150, actualQty: 120, unit: 'm' },
      week: { projectedValue: 1_260_000, actualValue: 1_050_000, projectedQty: 900, actualQty: 750, unit: 'm' },
      month: { projectedValue: 5_400_000, actualValue: 4_320_000, projectedQty: 3_850, actualQty: 3_080, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 8, 8],
      ['W2', 18, 16],
      ['W3', 30, 25],
      ['W4', 42, 34],
      ['W5', 55, 44],
      ['W6', 68, 55],
      ['W7', 80, 63],
    ]),
  },

  // ---------------------------------------------------------------- FLAGSHIP 2
  {
    id: 'hyd-hitec-ln2',
    name: 'HITEC City Metro Duct Line-2',
    client: 'GAIL Gas Ltd',
    location: 'HITEC City, Hyderabad',
    cluster: 'Hyderabad West',
    difficulty: 'medium',
    totalLengthMeters: 2200,
    route: {
      id: 'route-hyd-hitec-ln2',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [78.372, 17.443],
          [78.3765, 17.4462],
          [78.3808, 17.4495],
          [78.3852, 17.4528],
          [78.39, 17.456],
          [78.3948, 17.4592],
        ],
      },
    },
    startDate: '2026-04-12',
    endDate: '2026-07-30',
    status: 'on_track',
    lastUpdate: '2026-07-11T18:05:00',
    tasks: buildTasks(2200, {
      trench: [
        [0, 700],
        [700, 1400],
        [1500, 2000], // gap 1400-1500 (utility clash)
      ],
      pipe: [
        [0, 700],
        [700, 1400],
        [1500, 1900],
      ],
      refill: [
        [0, 700],
        [700, 1350],
        [1500, 1800],
      ],
      cable: [
        [0, 700],
        [700, 1200],
      ],
      chamber: [16, 12],
      splice: [14, 9],
      marker: [44, 34],
    }),
    team: {
      supervisor: { name: 'Suresh Kumar', phone: '+91 90000 77881', adherencePct: 94 },
      siteEngineer: { name: 'Farhan Ali', phone: '+91 91000 22334' },
      workers: [
        { name: 'Trenching crew A', trade: 'Excavation', count: 5 },
        { name: 'Trenching crew B', trade: 'Excavation', count: 5 },
        { name: 'Duct laying crew', trade: 'DWC laying', count: 6 },
        { name: 'Splicing team', trade: 'OFC splicing', count: 3 },
      ],
    },
    machines: [
      { id: 'EXC-198', type: 'JCB 3DX Excavator', assignedSince: '2026-04-12', dieselTodayL: 46, dieselBaselineL: 48, utilizationPct: 91, status: 'active' },
      { id: 'EXC-221', type: 'Chain Trencher', assignedSince: '2026-05-02', dieselTodayL: 63, dieselBaselineL: 55, utilizationPct: 84, status: 'active' },
      { id: 'TIP-030', type: 'Tipper Truck', assignedSince: '2026-04-12', dieselTodayL: 38, dieselBaselineL: 40, utilizationPct: 77, status: 'active' },
    ],
    finance: {
      currency: '₹',
      contractValue: 28_500_000,
      day: { projectedValue: 260_000, actualValue: 271_000, projectedQty: 200, actualQty: 208, unit: 'm' },
      week: { projectedValue: 1_560_000, actualValue: 1_600_000, projectedQty: 1_200, actualQty: 1_230, unit: 'm' },
      month: { projectedValue: 6_700_000, actualValue: 6_820_000, projectedQty: 5_150, actualQty: 5_240, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 10, 11],
      ['W2', 22, 24],
      ['W3', 35, 37],
      ['W4', 48, 50],
      ['W5', 60, 62],
      ['W6', 72, 73],
      ['W7', 84, 86],
    ]),
  },

  // ---------------------------------------------------------------- BEHIND
  {
    id: 'chn-omr-p1',
    name: 'OMR IT Corridor Cable Duct',
    client: 'Airtel Broadband',
    location: 'Old Mahabalipuram Rd, Chennai',
    cluster: 'Chennai IT',
    difficulty: 'hard',
    totalLengthMeters: 1800,
    route: {
      id: 'route-chn-omr-p1',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [80.227, 12.899],
          [80.2288, 12.9035],
          [80.2306, 12.908],
          [80.2325, 12.9125],
          [80.2344, 12.917],
        ],
      },
    },
    startDate: '2026-05-18',
    endDate: '2026-09-05',
    status: 'behind',
    lastUpdate: '2026-07-10T19:20:00',
    tasks: buildTasks(1800, {
      trench: [
        [0, 250],
        [400, 650], // multiple gaps: heavy rock + traffic police restrictions
        [800, 950],
      ],
      pipe: [
        [0, 250],
        [400, 600],
      ],
      refill: [[0, 250]],
      cable: [[0, 180]],
      chamber: [14, 4],
      splice: [12, 2],
      marker: [36, 10],
    }),
    team: {
      supervisor: { name: 'Prakash Nair', phone: '+91 94440 55667', adherencePct: 61 },
      siteEngineer: { name: 'Divya Rao', phone: '+91 95550 88990' },
      workers: [
        { name: 'Trenching crew', trade: 'Excavation', count: 4 },
        { name: 'Rock breaking crew', trade: 'Breaker', count: 3 },
        { name: 'General labour', trade: 'Refill / restore', count: 3 },
      ],
    },
    machines: [
      { id: 'EXC-176', type: 'JCB 3DX Excavator', assignedSince: '2026-05-18', dieselTodayL: 72, dieselBaselineL: 50, utilizationPct: 68, status: 'active' },
      { id: 'BRK-009', type: 'Rock Breaker Attachment', assignedSince: '2026-06-10', dieselTodayL: 20, dieselBaselineL: 18, utilizationPct: 55, status: 'active' },
    ],
    finance: {
      currency: '₹',
      contractValue: 24_000_000,
      day: { projectedValue: 190_000, actualValue: 96_000, projectedQty: 140, actualQty: 70, unit: 'm' },
      week: { projectedValue: 1_140_000, actualValue: 630_000, projectedQty: 840, actualQty: 460, unit: 'm' },
      month: { projectedValue: 4_900_000, actualValue: 2_700_000, projectedQty: 3_600, actualQty: 1_980, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 7, 6],
      ['W2', 16, 12],
      ['W3', 27, 18],
      ['W4', 39, 24],
      ['W5', 51, 31],
      ['W6', 63, 38],
      ['W7', 75, 44],
    ]),
  },

  // ---------------------------------------------------------------- ON TRACK
  {
    id: 'pun-hin-r4',
    name: 'Hinjewadi Ring FTTH Spur',
    client: 'Tata Play Fiber',
    location: 'Hinjewadi Phase-2, Pune',
    cluster: 'Pune West',
    difficulty: 'easy',
    totalLengthMeters: 1200,
    route: {
      id: 'route-pun-hin-r4',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.735, 18.588],
          [73.7385, 18.5905],
          [73.742, 18.593],
          [73.7455, 18.5955],
        ],
      },
    },
    startDate: '2026-06-01',
    endDate: '2026-08-10',
    status: 'on_track',
    lastUpdate: '2026-07-11T16:55:00',
    tasks: buildTasks(1200, {
      trench: [
        [0, 500],
        [500, 900],
      ],
      pipe: [
        [0, 500],
        [500, 850],
      ],
      refill: [
        [0, 500],
        [500, 800],
      ],
      cable: [[0, 480]],
      chamber: [10, 6],
      splice: [8, 5],
      marker: [24, 16],
    }),
    team: {
      supervisor: { name: 'Manoj Reddy', phone: '+91 98450 11223', adherencePct: 90 },
      siteEngineer: { name: 'Kavita Joshi', phone: '+91 98230 66778' },
      workers: [
        { name: 'Trenching crew', trade: 'Mini-excavator', count: 4 },
        { name: 'FTTH laying crew', trade: 'Micro-duct', count: 5 },
        { name: 'Splicing team', trade: 'OFC splicing', count: 2 },
      ],
    },
    machines: [
      { id: 'MEX-041', type: 'Mini Excavator', assignedSince: '2026-06-01', dieselTodayL: 22, dieselBaselineL: 24, utilizationPct: 86, status: 'active' },
      { id: 'MDB-002', type: 'Micro-duct Blower', assignedSince: '2026-06-08', dieselTodayL: 0, dieselBaselineL: 6, utilizationPct: 62, status: 'idle' },
    ],
    finance: {
      currency: '₹',
      contractValue: 13_800_000,
      day: { projectedValue: 150_000, actualValue: 156_000, projectedQty: 120, actualQty: 125, unit: 'm' },
      week: { projectedValue: 900_000, actualValue: 930_000, projectedQty: 720, actualQty: 745, unit: 'm' },
      month: { projectedValue: 3_900_000, actualValue: 3_960_000, projectedQty: 3_120, actualQty: 3_170, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 12, 13],
      ['W2', 26, 27],
      ['W3', 41, 42],
      ['W4', 56, 57],
      ['W5', 70, 71],
    ]),
  },

  // ---------------------------------------------------------------- AT RISK
  {
    id: 'del-dwk-b7',
    name: 'Dwarka Sector-7 Gas Pipeline',
    client: 'IGL Delhi',
    location: 'Dwarka, New Delhi',
    cluster: 'Delhi NCR',
    difficulty: 'medium',
    totalLengthMeters: 2600,
    route: {
      id: 'route-del-dwk-b7',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.04, 28.588],
          [77.0448, 28.591],
          [77.0496, 28.594],
          [77.0544, 28.597],
          [77.0592, 28.6],
          [77.064, 28.603],
        ],
      },
    },
    startDate: '2026-04-25',
    endDate: '2026-08-28',
    status: 'at_risk',
    lastUpdate: '2026-07-11T15:10:00',
    tasks: buildTasks(2600, {
      trench: [
        [0, 900],
        [1000, 1600],
        [1750, 2100],
      ],
      pipe: [
        [0, 900],
        [1000, 1500],
      ],
      refill: [
        [0, 850],
        [1000, 1300],
      ],
      cable: [[0, 700]],
      chamber: [18, 9],
      splice: [0, 0],
      marker: [52, 28],
    }),
    team: {
      supervisor: { name: 'Vikram Singh', phone: '+91 99110 22446', adherencePct: 76 },
      siteEngineer: { name: 'Neha Gupta', phone: '+91 99120 55779' },
      workers: [
        { name: 'Trenching crew A', trade: 'Excavation', count: 6 },
        { name: 'Pipe welding crew', trade: 'MS pipe welding', count: 4 },
        { name: 'General labour', trade: 'Refill / restore', count: 6 },
      ],
    },
    machines: [
      { id: 'EXC-233', type: 'JCB 3DX Excavator', assignedSince: '2026-04-25', dieselTodayL: 52, dieselBaselineL: 48, utilizationPct: 82, status: 'active' },
      { id: 'WLD-014', type: 'Welding Generator', assignedSince: '2026-05-15', dieselTodayL: 33, dieselBaselineL: 30, utilizationPct: 74, status: 'active' },
      { id: 'PAV-003', type: 'Paver / Restoration', assignedSince: '2026-06-20', dieselTodayL: 0, dieselBaselineL: 28, utilizationPct: 18, status: 'maintenance' },
    ],
    finance: {
      currency: '₹',
      contractValue: 34_000_000,
      day: { projectedValue: 300_000, actualValue: 246_000, projectedQty: 200, actualQty: 164, unit: 'm' },
      week: { projectedValue: 1_800_000, actualValue: 1_500_000, projectedQty: 1_200, actualQty: 1_000, unit: 'm' },
      month: { projectedValue: 7_700_000, actualValue: 6_400_000, projectedQty: 5_130, actualQty: 4_270, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 9, 8],
      ['W2', 20, 18],
      ['W3', 32, 28],
      ['W4', 44, 38],
      ['W5', 57, 48],
      ['W6', 69, 58],
      ['W7', 81, 68],
    ]),
  },

  // ---------------------------------------------------------------- ON HOLD
  {
    id: 'kol-sal-c2',
    name: 'Salt Lake Sector-V Duct',
    client: 'BSNL Bharatnet',
    location: 'Salt Lake, Kolkata',
    cluster: 'Kolkata East',
    difficulty: 'medium',
    totalLengthMeters: 1400,
    route: {
      id: 'route-kol-sal-c2',
      source: 'hand_drawn',
      geometry: {
        type: 'LineString',
        coordinates: [
          [88.423, 22.574],
          [88.4262, 22.5768],
          [88.4294, 22.5796],
          [88.4326, 22.5824],
          [88.4358, 22.5852],
        ],
      },
    },
    startDate: '2026-05-10',
    endDate: '2026-08-20',
    status: 'on_hold',
    lastUpdate: '2026-07-08T14:30:00',
    tasks: buildTasks(1400, {
      trench: [
        [0, 400],
        [500, 750],
      ],
      pipe: [[0, 400]],
      refill: [[0, 380]],
      cable: [[0, 200]],
      chamber: [11, 3],
      splice: [9, 1],
      marker: [28, 8],
    }),
    team: {
      supervisor: { name: 'Sourav Das', phone: '+91 98300 44662', adherencePct: 70 },
      siteEngineer: { name: 'Ritika Sen', phone: '+91 98310 77995' },
      workers: [
        { name: 'Trenching crew', trade: 'Excavation', count: 4 },
        { name: 'Duct laying crew', trade: 'DWC laying', count: 3 },
      ],
    },
    machines: [
      { id: 'EXC-188', type: 'JCB 3DX Excavator', assignedSince: '2026-05-10', dieselTodayL: 0, dieselBaselineL: 48, utilizationPct: 0, status: 'idle' },
    ],
    finance: {
      currency: '₹',
      contractValue: 16_500_000,
      day: { projectedValue: 0, actualValue: 0, projectedQty: 0, actualQty: 0, unit: 'm' },
      week: { projectedValue: 0, actualValue: 0, projectedQty: 0, actualQty: 0, unit: 'm' },
      month: { projectedValue: 2_800_000, actualValue: 1_100_000, projectedQty: 2_100, actualQty: 830, unit: 'm' },
    },
    schedule: schedule([
      ['W1', 10, 9],
      ['W2', 21, 19],
      ['W3', 33, 27],
      ['W4', 45, 31],
      ['W5', 45, 31],
    ]),
  },
];

export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/** Unique supervisors with the project ids they're assigned to. */
export function getSupervisors(): { name: string; projectIds: string[] }[] {
  const map = new Map<string, string[]>();
  for (const p of PROJECTS) {
    const name = p.team.supervisor.name;
    map.set(name, [...(map.get(name) ?? []), p.id]);
  }
  return [...map.entries()]
    .map(([name, projectIds]) => ({ name, projectIds }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
