// generate-account-plan.js
// Usage: NODE_PATH=$(npm root -g) node generate-account-plan.js <path-to-json>
//
// Requires the 'docx' package installed globally: npm install -g docx

"use strict";

const fs = require("fs");
const path = require("path");

// Resolve docx from global node_modules if not in local node_modules
let docx;
try {
  docx = require("docx");
} catch (e) {
  const globalModules = process.env.NODE_PATH || "";
  if (!globalModules) {
    console.error("ERROR: Cannot find 'docx' module. Run with: NODE_PATH=$(npm root -g) node generate-account-plan.js");
    process.exit(1);
  }
  try {
    docx = require(path.join(globalModules, "docx"));
  } catch (e2) {
    console.error("ERROR: Cannot find 'docx' module in NODE_PATH: " + globalModules);
    process.exit(1);
  }
}

const {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  WidthType,
  ShadingType,
  PageNumber,
  NumberFormat,
  HeadingLevel,
  LevelFormat,
  convertInchesToTwip,
  PageSize,
  PageOrientation,
  BorderStyle,
  AbstractNumbering,
  ConcreteNumbering,
  Numbering,
  VerticalAlign,
  ExternalHyperlink,
  PageBreak,
} = docx;

// ─── Color constants ────────────────────────────────────────────────────────
const BLUE = "1A5276";
const GRAY = "808080";
const LIGHT_GRAY = "F2F2F2";
const WHITE = "FFFFFF";

// ─── DXA helpers ────────────────────────────────────────────────────────────
const PAGE_WIDTH_DXA = 12240;
const PAGE_HEIGHT_DXA = 15840;
const MARGIN_DXA = convertInchesToTwip(1); // 1440
const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2; // 9360

// ─── Utility: null check ─────────────────────────────────────────────────────
function isNull(val) {
  return val === null || val === undefined || val === "";
}

// ─── Utility: safe string ────────────────────────────────────────────────────
function str(val) {
  if (isNull(val)) return "";
  return String(val);
}

// ─── Text helpers ────────────────────────────────────────────────────────────
function bodyRun(text, opts = {}) {
  return new TextRun({
    text: str(text),
    font: "Arial",
    size: 20, // 10pt = 20 half-points
    color: "000000",
    ...opts,
  });
}

function italicGrayPlaceholder() {
  return new TextRun({
    text: "___________",
    font: "Arial",
    size: 20,
    color: GRAY,
    italics: true,
  });
}

function hypothesizedSuffix() {
  return new TextRun({
    text: " (To Be Validated by AE)",
    font: "Arial",
    size: 20,
    color: GRAY,
    italics: true,
  });
}

// ─── Paragraph helpers ──────────────────────────────────────────────────────
function bodyPara(text, opts = {}) {
  const runs = [];
  if (isNull(text)) {
    runs.push(italicGrayPlaceholder());
  } else {
    runs.push(bodyRun(str(text), opts.runOpts || {}));
  }
  return new Paragraph({
    children: runs,
    spacing: { after: 100 },
    alignment: AlignmentType.LEFT,
    ...(opts.paraOpts || {}),
  });
}

function hypothesizedPara(text) {
  if (isNull(text)) {
    return new Paragraph({
      children: [italicGrayPlaceholder()],
      spacing: { after: 100 },
    });
  }
  return new Paragraph({
    children: [bodyRun(str(text)), hypothesizedSuffix()],
    spacing: { after: 100 },
  });
}

function sectionHeading(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: str(text),
        font: "Arial",
        size: 28, // 14pt
        bold: true,
        color: BLUE,
      }),
    ],
    spacing: { before: 200, after: 200 },
  });
}

function subHeading(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: str(text),
        font: "Arial",
        size: 22, // 11pt
        bold: true,
        color: BLUE,
      }),
    ],
    spacing: { before: 160, after: 80 },
  });
}

function emptyPara() {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    spacing: { after: 80 },
  });
}

function pageBreakPara() {
  return new Paragraph({
    children: [new PageBreak()],
  });
}

// ─── Bullet list helper ──────────────────────────────────────────────────────
// Returns array of Paragraphs, one per item, using numbered abstraction reference
function bulletList(items, numId, hypothesized = false) {
  if (!items || items.length === 0) {
    return [
      new Paragraph({
        children: [italicGrayPlaceholder()],
        spacing: { after: 60 },
      }),
    ];
  }
  return items.map((item) => {
    const runs = hypothesized
      ? [bodyRun(str(item)), hypothesizedSuffix()]
      : [bodyRun(str(item))];
    return new Paragraph({
      children: runs,
      numbering: { reference: numId, level: 0 },
      spacing: { after: 60 },
    });
  });
}

// ─── Table helpers ───────────────────────────────────────────────────────────
function headerCell(text, widthDXA) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: str(text),
            font: "Arial",
            size: 18,
            bold: true,
            color: WHITE,
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
      }),
    ],
    shading: { type: ShadingType.CLEAR, color: "auto", fill: BLUE },
    width: { size: widthDXA, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
}

function dataCell(content, widthDXA, isGrayRow = false, opts = {}) {
  const fill = isGrayRow ? LIGHT_GRAY : WHITE;
  let children;
  if (isNull(content)) {
    children = [
      new Paragraph({
        children: [italicGrayPlaceholder()],
        spacing: { before: 60, after: 60 },
      }),
    ];
  } else if (typeof content === "string" || typeof content === "number") {
    const runs = opts.hypothesized
      ? [bodyRun(str(content)), hypothesizedSuffix()]
      : [bodyRun(str(content))];
    children = [
      new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60 },
      }),
    ];
  } else if (Array.isArray(content)) {
    children = content;
  } else {
    children = [
      new Paragraph({
        children: [bodyRun(str(content))],
        spacing: { before: 60, after: 60 },
      }),
    ];
  }
  return new TableCell({
    children,
    shading: { type: ShadingType.CLEAR, color: "auto", fill },
    width: { size: widthDXA, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    verticalAlign: VerticalAlign.TOP,
    ...opts.cellOpts,
  });
}

function twoColTable(rows) {
  // rows: [{label, value, hypothesized}]
  const col1 = Math.floor(CONTENT_WIDTH_DXA * 0.30);
  const col2 = CONTENT_WIDTH_DXA - col1;
  const tableRows = rows.map((row, i) => {
    const isGray = i % 2 !== 0;
    return new TableRow({
      children: [
        dataCell(row.label, col1, isGray, { cellOpts: {} }),
        dataCell(row.value, col2, isGray, { hypothesized: row.hypothesized || false }),
      ],
    });
  });
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [col1, col2],
    rows: tableRows,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
}

// ─── Header / Footer ─────────────────────────────────────────────────────────
function makeHeader() {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: "CONFIDENTIAL | You.com Account Plan",
            font: "Arial",
            size: 18, // 9pt
            color: GRAY,
            italics: true,
          }),
        ],
        alignment: AlignmentType.RIGHT,
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            font: "Arial",
            size: 18,
            color: GRAY,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

// ─── Numbering definition ─────────────────────────────────────────────────────
function makeNumbering() {
  return {
    config: [
      {
        reference: "bullet-list",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
              },
              run: {
                font: "Arial",
                size: 20,
              },
            },
          },
        ],
      },
    ],
  };
}

// ─── SECTION BUILDERS ────────────────────────────────────────────────────────

// TITLE PAGE
function buildTitlePage(data) {
  const paras = [];
  // Spacer
  for (let i = 0; i < 8; i++) paras.push(emptyPara());

  paras.push(
    new Paragraph({
      children: [
        new TextRun({
          text: str(data.company),
          font: "Arial",
          size: 72, // 36pt
          bold: true,
          color: BLUE,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  paras.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Account Plan",
          font: "Arial",
          size: 48, // 24pt
          bold: true,
          color: BLUE,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  paras.push(
    new Paragraph({
      children: [
        new TextRun({
          text: str(data.date),
          font: "Arial",
          size: 24,
          color: "555555",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  paras.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Prepared by You.com Sales Team",
          font: "Arial",
          size: 22,
          color: GRAY,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  paras.push(pageBreakPara());
  return paras;
}

// SECTION 1: Company Overview
function buildOverview(sec) {
  const paras = [];
  paras.push(sectionHeading("1. Company Overview"));

  // Build key-value rows
  const rows = [
    { label: "Company", value: sec.company_name },
    { label: "Website", value: sec.website },
    { label: "Headquarters", value: sec.hq },
    { label: "Employees", value: sec.employees },
    { label: "Revenue", value: sec.revenue },
    { label: "Industry", value: sec.industry },
  ];
  paras.push(twoColTable(rows));
  paras.push(emptyPara());

  // Business Units
  paras.push(subHeading("Business Units"));
  if (isNull(sec.business_units) || sec.business_units.length === 0) {
    paras.push(bodyPara(null));
  } else {
    bulletList(sec.business_units, "bullet-list").forEach((p) => paras.push(p));
  }

  // Tech Stack
  paras.push(subHeading("Tech Stack"));
  if (isNull(sec.tech_stack) || sec.tech_stack.length === 0) {
    paras.push(bodyPara(null));
  } else {
    bulletList(sec.tech_stack, "bullet-list").forEach((p) => paras.push(p));
  }

  // Recent Press
  paras.push(subHeading("Recent Press"));
  if (isNull(sec.recent_press) || sec.recent_press.length === 0) {
    paras.push(bodyPara(null));
  } else {
    bulletList(sec.recent_press, "bullet-list").forEach((p) => paras.push(p));
  }

  // AI Initiatives
  paras.push(subHeading("AI Initiatives"));
  if (isNull(sec.ai_initiatives) || sec.ai_initiatives.length === 0) {
    paras.push(bodyPara(null));
  } else {
    bulletList(sec.ai_initiatives, "bullet-list").forEach((p) => paras.push(p));
  }

  // AE-only fields
  paras.push(subHeading("Existing Relationship"));
  if (isNull(sec.existing_relationship)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.existing_relationship));
  }

  paras.push(subHeading("Renewal Details"));
  if (isNull(sec.renewal_details)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.renewal_details));
  }

  paras.push(subHeading("Internal Ownership"));
  if (isNull(sec.internal_ownership)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.internal_ownership));
  }

  paras.push(pageBreakPara());
  return paras;
}

// SECTION 2: Strategic Context
function buildStrategicContext(sec) {
  const paras = [];
  paras.push(sectionHeading("2. Strategic Context"));

  const fields = [
    { label: "Corporate Strategy", key: "corporate_strategy", hyp: false },
    { label: "Industry Trends", key: "industry_trends", hyp: false },
    { label: "AI Programs", key: "ai_programs", hyp: false },
    { label: "Earnings Themes", key: "earnings_themes", hyp: false },
    { label: "Market Pressures", key: "market_pressures", hyp: false },
  ];

  fields.forEach(({ label, key, hyp }) => {
    paras.push(subHeading(label));
    if (isNull(sec[key])) {
      paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
    } else if (hyp) {
      paras.push(hypothesizedPara(sec[key]));
    } else {
      paras.push(bodyPara(sec[key]));
    }
  });

  paras.push(subHeading("Hypothesized Priorities"));
  if (!isNull(sec.hypothesized_priorities) && sec.hypothesized_priorities.length > 0) {
    bulletList(sec.hypothesized_priorities, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Hypothesized Success Metrics"));
  if (!isNull(sec.hypothesized_metrics) && sec.hypothesized_metrics.length > 0) {
    bulletList(sec.hypothesized_metrics, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(pageBreakPara());
  return paras;
}

// SECTION 3: Buying Center
function buildBuyingCenter(sec) {
  const paras = [];
  paras.push(sectionHeading("3. Buying Center"));

  // Stakeholders table
  paras.push(subHeading("Key Stakeholders"));
  if (!isNull(sec.stakeholders) && sec.stakeholders.length > 0) {
    const col1 = Math.floor(CONTENT_WIDTH_DXA * 0.22);
    const col2 = Math.floor(CONTENT_WIDTH_DXA * 0.28);
    const col3 = Math.floor(CONTENT_WIDTH_DXA * 0.25);
    const col4 = CONTENT_WIDTH_DXA - col1 - col2 - col3;

    const headerRow = new TableRow({
      children: [
        headerCell("Name", col1),
        headerCell("Title", col2),
        headerCell("Relevance", col3),
        headerCell("LinkedIn", col4),
      ],
      tableHeader: true,
    });

    const dataRows = sec.stakeholders.map((s, i) => {
      const isGray = i % 2 !== 0;
      const fill = isGray ? LIGHT_GRAY : WHITE;
      const linkedInPara = isNull(s.linkedin)
        ? new Paragraph({ children: [italicGrayPlaceholder()], spacing: { before: 60, after: 60 } })
        : new Paragraph({
            children: [
              new ExternalHyperlink({
                link: str(s.linkedin),
                children: [
                  new TextRun({
                    text: "View Profile",
                    font: "Arial",
                    size: 18,
                    color: "0563C1",
                    style: "Hyperlink",
                  }),
                ],
              }),
            ],
            spacing: { before: 60, after: 60 },
          });

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(s.name)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col1, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(s.title)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col2, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(s.relevance)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col3, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
          new TableCell({
            children: [linkedInPara],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col4, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
        ],
      });
    });

    paras.push(
      new Table({
        width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
        columnWidths: [col1, col2, col3, col4],
        rows: [headerRow, ...dataRows],
      })
    );
    paras.push(emptyPara());
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // Potential Influencers
  paras.push(subHeading("Potential Influencers"));
  paras.push(bodyPara(sec.potential_influencers));

  // Champion Candidates
  paras.push(subHeading("Champion Candidates"));
  paras.push(bodyPara(sec.champion_candidates));

  // AE-only fields
  paras.push(subHeading("Economic Buyer (Confirmed)"));
  if (isNull(sec.economic_buyer)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.economic_buyer));
  }

  paras.push(subHeading("Champion (Confirmed)"));
  if (isNull(sec.champion)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.champion));
  }

  paras.push(subHeading("Additional Stakeholders"));
  if (isNull(sec.additional_stakeholders)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.additional_stakeholders));
  }

  paras.push(pageBreakPara());
  return paras;
}

// SECTION 4: Pain and Impact
function buildPainAndImpact(sec) {
  const paras = [];
  paras.push(sectionHeading("4. Pain and Impact"));

  paras.push(subHeading("Public Pain Points"));
  if (!isNull(sec.public_pain_points) && sec.public_pain_points.length > 0) {
    bulletList(sec.public_pain_points, "bullet-list").forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Data / Search Signals"));
  paras.push(bodyPara(sec.data_search_signals));

  paras.push(subHeading("Hypothesized Pains"));
  if (!isNull(sec.hypothesized_pains) && sec.hypothesized_pains.length > 0) {
    bulletList(sec.hypothesized_pains, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Hypothesized Impact"));
  if (isNull(sec.hypothesized_impact)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(hypothesizedPara(sec.hypothesized_impact));
  }

  // AE-only fields
  paras.push(subHeading("Confirmed Pains"));
  if (isNull(sec.confirmed_pains)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.confirmed_pains));
  }

  paras.push(subHeading("Quantified Impact"));
  if (isNull(sec.quantified_impact)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.quantified_impact));
  }

  paras.push(subHeading("Current Workarounds"));
  if (isNull(sec.current_workarounds)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.current_workarounds));
  }

  paras.push(emptyPara());
  return paras;
}

// SECTION 5: Solution Mapping
function buildSolutionMapping(sec) {
  const paras = [];
  paras.push(pageBreakPara());
  paras.push(sectionHeading("5. Solution Mapping"));

  // Use Cases table
  paras.push(subHeading("Use Cases"));
  if (!isNull(sec.use_cases) && sec.use_cases.length > 0) {
    const col1 = Math.floor(CONTENT_WIDTH_DXA * 0.25);
    const col2 = Math.floor(CONTENT_WIDTH_DXA * 0.50);
    const col3 = CONTENT_WIDTH_DXA - col1 - col2;

    const headerRow = new TableRow({
      children: [
        headerCell("Use Case", col1),
        headerCell("Description", col2),
        headerCell("Persona", col3),
      ],
      tableHeader: true,
    });

    const dataRows = sec.use_cases.map((uc, i) => {
      const isGray = i % 2 !== 0;
      const fill = isGray ? LIGHT_GRAY : WHITE;
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(uc.name)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col1, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(uc.description), hypothesizedSuffix()], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col2, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(uc.persona)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: col3, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
        ],
      });
    });

    paras.push(
      new Table({
        width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
        columnWidths: [col1, col2, col3],
        rows: [headerRow, ...dataRows],
      })
    );
    paras.push(emptyPara());
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Agentic Workflows"));
  paras.push(bodyPara(sec.agentic_workflows));

  paras.push(subHeading("Hypothesized Success Metrics"));
  if (!isNull(sec.hypothesized_metrics) && sec.hypothesized_metrics.length > 0) {
    bulletList(sec.hypothesized_metrics, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // AE-only fields
  paras.push(subHeading("Final Use Cases (Confirmed)"));
  if (isNull(sec.final_use_cases)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.final_use_cases));
  }

  paras.push(subHeading("Confirmed Requirements"));
  if (isNull(sec.confirmed_requirements)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.confirmed_requirements));
  }

  paras.push(subHeading("Integration Points"));
  if (isNull(sec.integration_points)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.integration_points));
  }

  paras.push(emptyPara());
  return paras;
}

// SECTION 6: Competitive Risk
function buildCompetitiveRisk(sec) {
  const paras = [];
  paras.push(sectionHeading("6. Competitive Risk"));

  paras.push(subHeading("Known Competitors / Alternatives"));
  if (!isNull(sec.known_competitors) && sec.known_competitors.length > 0) {
    bulletList(sec.known_competitors, "bullet-list").forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Product Comparisons"));
  paras.push(bodyPara(sec.product_comparisons));

  paras.push(subHeading("Potential Risks"));
  if (!isNull(sec.potential_risks) && sec.potential_risks.length > 0) {
    bulletList(sec.potential_risks, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // AE-only fields
  paras.push(subHeading("Actual Competitive Position (Confirmed)"));
  if (isNull(sec.actual_position)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.actual_position));
  }

  paras.push(subHeading("Internal Risks"));
  if (isNull(sec.internal_risks)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.internal_risks));
  }

  paras.push(emptyPara());
  return paras;
}

// SECTION 7: ROI
function buildROI(sec) {
  const paras = [];
  paras.push(sectionHeading("7. ROI Model"));

  paras.push(subHeading("Baseline Assumptions"));
  if (!isNull(sec.baseline_assumptions) && sec.baseline_assumptions.length > 0) {
    bulletList(sec.baseline_assumptions, "bullet-list", true).forEach((p) => paras.push(p));
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  paras.push(subHeading("Hypothesized ROI Narrative"));
  if (isNull(sec.hypothesized_roi)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(hypothesizedPara(sec.hypothesized_roi));
  }

  // AE-only fields
  paras.push(subHeading("Validated Inputs"));
  if (isNull(sec.validated_inputs)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.validated_inputs));
  }

  paras.push(subHeading("Final Value Narrative"));
  if (isNull(sec.final_value_narrative)) {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  } else {
    paras.push(bodyPara(sec.final_value_narrative));
  }

  paras.push(emptyPara());
  return paras;
}

// SECTION 8: Outreach Strategy
function buildOutreachStrategy(sec) {
  const paras = [];
  paras.push(pageBreakPara());
  paras.push(sectionHeading("8. Outreach Strategy"));

  // Sequence Overview table
  paras.push(subHeading("Sequence Overview"));
  if (!isNull(sec.sequence_overview) && sec.sequence_overview.length > 0) {
    const col1 = Math.floor(CONTENT_WIDTH_DXA * 0.12);
    const col2 = Math.floor(CONTENT_WIDTH_DXA * 0.22);
    const col3 = Math.floor(CONTENT_WIDTH_DXA * 0.33);
    const col4 = CONTENT_WIDTH_DXA - col1 - col2 - col3;

    const headerRow = new TableRow({
      children: [
        headerCell("Seq", col1),
        headerCell("Persona", col2),
        headerCell("Use Case Focus", col3),
        headerCell("Hook Type", col4),
      ],
      tableHeader: true,
    });

    const dataRows = sec.sequence_overview.map((row, i) => {
      const isGray = i % 2 !== 0;
      const fill = isGray ? LIGHT_GRAY : WHITE;
      const cells = [
        { val: row.sequence, w: col1 },
        { val: row.persona, w: col2 },
        { val: row.use_case_focus, w: col3 },
        { val: row.hook_type, w: col4 },
      ];
      return new TableRow({
        children: cells.map(({ val, w }) =>
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(val)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: w, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          })
        ),
      });
    });

    paras.push(
      new Table({
        width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
        columnWidths: [col1, col2, col3, col4],
        rows: [headerRow, ...dataRows],
      })
    );
    paras.push(emptyPara());
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // Contact Assignments table
  paras.push(subHeading("Contact Assignments"));
  if (!isNull(sec.contact_assignments) && sec.contact_assignments.length > 0) {
    const col1 = Math.floor(CONTENT_WIDTH_DXA * 0.18);
    const col2 = Math.floor(CONTENT_WIDTH_DXA * 0.22);
    const col3 = Math.floor(CONTENT_WIDTH_DXA * 0.28);
    const col4 = Math.floor(CONTENT_WIDTH_DXA * 0.10);
    const col5 = CONTENT_WIDTH_DXA - col1 - col2 - col3 - col4;

    const headerRow = new TableRow({
      children: [
        headerCell("Name", col1),
        headerCell("Title", col2),
        headerCell("Email", col3),
        headerCell("Seq", col4),
        headerCell("Rationale", col5),
      ],
      tableHeader: true,
    });

    const dataRows = sec.contact_assignments.map((c, i) => {
      const isGray = i % 2 !== 0;
      const fill = isGray ? LIGHT_GRAY : WHITE;
      const cells = [
        { val: c.name, w: col1 },
        { val: c.title, w: col2 },
        { val: c.email, w: col3 },
        { val: c.sequence, w: col4 },
        { val: c.rationale, w: col5 },
      ];
      return new TableRow({
        children: cells.map(({ val, w }) =>
          new TableCell({
            children: [new Paragraph({ children: [bodyRun(val)], spacing: { before: 60, after: 60 } })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill },
            width: { size: w, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          })
        ),
      });
    });

    paras.push(
      new Table({
        width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
        columnWidths: [col1, col2, col3, col4, col5],
        rows: [headerRow, ...dataRows],
      })
    );
    paras.push(emptyPara());
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // Hook Strategy
  paras.push(subHeading("Hook Strategy"));
  const hooks = sec.hook_strategy || {};
  const hookKeys = ["seq_a", "seq_b", "seq_c", "seq_d"];
  const hookLabels = { seq_a: "Sequence A", seq_b: "Sequence B", seq_c: "Sequence C", seq_d: "Sequence D" };
  const hookRows = hookKeys
    .filter((k) => !isNull(hooks[k]))
    .map((k) => ({ label: hookLabels[k], value: hooks[k] }));

  if (hookRows.length > 0) {
    paras.push(twoColTable(hookRows));
    paras.push(emptyPara());
  } else {
    paras.push(new Paragraph({ children: [italicGrayPlaceholder()], spacing: { after: 100 } }));
  }

  // Socher Placement
  paras.push(subHeading("Socher Placement"));
  paras.push(bodyPara(sec.socher_placement));

  // Notes
  paras.push(subHeading("Notes"));
  paras.push(bodyPara(sec.notes));

  return paras;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("ERROR: No input file specified.");
    console.error("Usage: NODE_PATH=$(npm root -g) node generate-account-plan.js <path-to-json>");
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error("ERROR: File not found: " + inputFile);
    process.exit(1);
  }

  let data;
  try {
    const raw = fs.readFileSync(inputFile, "utf8");
    data = JSON.parse(raw);
  } catch (e) {
    console.error("ERROR: Invalid JSON in file: " + inputFile);
    console.error(e.message);
    process.exit(1);
  }

  if (!data.sections) {
    console.error("ERROR: JSON missing 'sections' key.");
    process.exit(1);
  }

  const s = data.sections;
  const numbering = makeNumbering();

  const children = [
    ...buildTitlePage(data),
    ...buildOverview(s.overview || {}),
    ...buildStrategicContext(s.strategic_context || {}),
    ...buildBuyingCenter(s.buying_center || {}),
    ...buildPainAndImpact(s.pain_and_impact || {}),
    ...buildSolutionMapping(s.solution_mapping || {}),
    ...buildCompetitiveRisk(s.competitive_risk || {}),
    ...buildROI(s.roi || {}),
    ...buildOutreachStrategy(s.outreach_strategy || {}),
  ];

  const doc = new Document({
    numbering,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH_DXA,
              height: PAGE_HEIGHT_DXA,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: MARGIN_DXA,
              bottom: MARGIN_DXA,
              left: MARGIN_DXA,
              right: MARGIN_DXA,
            },
          },
        },
        headers: { default: makeHeader() },
        footers: { default: makeFooter() },
        children,
      },
    ],
  });

  const outputPath = data.output_path;
  if (!outputPath) {
    console.error("ERROR: JSON missing 'output_path' key.");
    process.exit(1);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { Packer } = docx;
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);

  console.log("SUCCESS: " + data.company + "_Account_Plan.docx written to " + outputPath);
}

main().catch((err) => {
  console.error("ERROR: " + err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
