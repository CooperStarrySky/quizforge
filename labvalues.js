/* QuizForge — NBME lab reference sheet.
 * Self-contained: injects its own styles + floating panel and exposes window.toggleLabValues().
 * Values transcribed from NBME_Laboratory_Reference_Values.pdf (nbme.org, 2026-04 upload).
 * Also copied into the AnkiCards workspace (projects/QuizForge, projects/QuizForge-MD) — keep the copies identical.
 */
(function () {
  'use strict';

  // Row: [name, conventional range, SI range, search aliases?, indent level?]
  // Ranges may be arrays (one line each, e.g. Male / Female).
  const M = 'Male:', F = 'Female:';
  const TABS = [
    { id: 'serum', label: 'Serum', sections: [
      { title: 'General chemistry', rows: [
        ['Sodium (Na<sup>+</sup>)', '136–146 mEq/L', '136–146 mmol/L', 'na electrolytes', 1],
        ['Potassium (K<sup>+</sup>)', '3.5–5.0 mEq/L', '3.5–5.0 mmol/L', 'k electrolytes', 1],
        ['Chloride (Cl<sup>–</sup>)', '95–105 mEq/L', '95–105 mmol/L', 'cl electrolytes', 1],
        ['Bicarbonate (HCO<sub>3</sub><sup>–</sup>)', '22–28 mEq/L', '22–28 mmol/L', 'hco3 bicarb co2 electrolytes', 1],
        ['Urea nitrogen', '7–18 mg/dL', '2.5–6.4 mmol/L', 'bun blood urea nitrogen'],
        ['Creatinine', '0.6–1.2 mg/dL', '53–106 μmol/L', 'cr'],
        ['Glucose', ['Fasting: 70–100 mg/dL', 'Random, non-fasting: &lt;140 mg/dL'], ['3.8–5.6 mmol/L', '&lt;7.77 mmol/L'], 'sugar bg'],
        ['Calcium', '8.4–10.2 mg/dL', '2.1–2.6 mmol/L', 'ca'],
        ['Magnesium (Mg<sup>2+</sup>)', '1.5–2.0 mg/dL', '0.75–1.0 mmol/L', 'mg'],
        ['Phosphorus (inorganic)', '3.0–4.5 mg/dL', '1.0–1.5 mmol/L', 'phosphate po4'],
      ]},
      { title: 'Hepatic', rows: [
        ['Alanine aminotransferase (ALT)', '10–40 U/L', '10–40 U/L', 'sgpt lft liver'],
        ['Aspartate aminotransferase (AST)', '12–38 U/L', '12–38 U/L', 'sgot lft liver'],
        ['Alkaline phosphatase', '25–100 U/L', '25–100 U/L', 'alp alk phos'],
        ['Bilirubin, total', '0.1–1.0 mg/dL', '2–17 μmol/L', 'bili tbili'],
        ['Bilirubin, direct', '0.0–0.3 mg/dL', '0–5 μmol/L', 'bili conjugated dbili'],
        ['Proteins, total', '6.0–7.8 g/dL', '60–78 g/L', 'total protein'],
        ['Albumin', '3.5–5.5 g/dL', '35–55 g/L', 'alb', 1],
        ['Globulin', '2.3–3.5 g/dL', '23–35 g/L', '', 1],
      ]},
      { title: 'Other, serum', rows: [
        ['Amylase', '25–125 U/L', '25–125 U/L', 'pancreas'],
        ['Lipase', '13–60 U/L', '13–60 U/L', 'pancreas'],
        ['Creatinine clearance', [M + ' 97–137 mL/min', F + ' 88–128 mL/min'], ['97–137 mL/min', '88–128 mL/min'], 'crcl gfr'],
        ['Creatine kinase', [M + ' 25–90 U/L', F + ' 10–70 U/L'], ['25–90 U/L', '10–70 U/L'], 'ck cpk'],
        ['Lactate dehydrogenase', '45–200 U/L', '45–200 U/L', 'ldh'],
        ['Osmolality', '275–295 mOsmol/kg H<sub>2</sub>O', '275–295 mOsmol/kg H<sub>2</sub>O', 'osm serum osmolality'],
        ['Troponin I', '≤0.04 ng/mL', '≤0.04 μg/L', 'trop tni cardiac'],
        ['Uric acid', '3.0–8.2 mg/dL', '0.18–0.48 mmol/L', 'urate gout'],
      ]},
      { title: 'Lipids', rows: [
        ['Cholesterol, total', ['Normal: &lt;200 mg/dL', 'High: &gt;240 mg/dL'], ['&lt;5.2 mmol/L', '&gt;6.2 mmol/L'], 'chol tc'],
        ['Cholesterol, HDL', '40–60 mg/dL', '1.0–1.6 mmol/L', 'hdl'],
        ['Cholesterol, LDL', '&lt;160 mg/dL', '&lt;4.2 mmol/L', 'ldl'],
        ['Triglycerides', ['Normal: &lt;150 mg/dL', 'Borderline: 151–199 mg/dL'], ['&lt;1.70 mmol/L', '1.71–2.25 mmol/L'], 'tg trigs'],
      ]},
      { title: 'Iron studies', rows: [
        ['Ferritin', [M + ' 20–250 ng/mL', F + ' 10–120 ng/mL'], ['20–250 μg/L', '10–120 μg/L'], 'iron'],
        ['Iron', [M + ' 65–175 μg/dL', F + ' 50–170 μg/dL'], ['11.6–31.3 μmol/L', '9.0–30.4 μmol/L'], 'fe serum iron'],
        ['Total iron-binding capacity', '250–400 μg/dL', '44.8–71.6 μmol/L', 'tibc iron'],
        ['Transferrin', '200–360 mg/dL', '2.0–3.6 g/L', 'iron'],
      ]},
      { title: 'Immunoglobulins', rows: [
        ['IgA', '76–390 mg/dL', '0.76–3.90 g/L', 'immunoglobulin antibody'],
        ['IgE', '0–380 IU/mL', '0–380 kIU/L', 'immunoglobulin antibody'],
        ['IgG', '650–1500 mg/dL', '6.5–15.0 g/L', 'immunoglobulin antibody'],
        ['IgM', '50–300 mg/dL', '0.5–3.0 g/L', 'immunoglobulin antibody'],
      ]},
    ]},
    { id: 'endo', label: 'Endocrine', sections: [
      { title: 'Endocrine, serum', rows: [
        ['Follicle-stimulating hormone', [M + ' 4–25 mIU/mL', F + ' premenopause 4–30 mIU/mL', 'midcycle peak 10–90 mIU/mL', 'postmenopause 40–250 mIU/mL'], ['4–25 IU/L', '4–30 IU/L', '10–90 IU/L', '40–250 IU/L'], 'fsh'],
        ['Luteinizing hormone', [M + ' 6–23 mIU/mL', F + ' follicular phase 5–30 mIU/mL', 'midcycle 75–150 mIU/mL', 'postmenopause 30–200 mIU/mL'], ['6–23 IU/L', '5–30 IU/L', '75–150 IU/L', '30–200 IU/L'], 'lh'],
        ['Growth hormone – arginine stimulation', ['Fasting: &lt;5 ng/mL', 'Provocative stimuli: &gt;7 ng/mL'], ['&lt;5 μg/L', '&gt;7 μg/L'], 'gh somatotropin'],
        ['Prolactin (hPRL)', [M + ' &lt;17 ng/mL', F + ' &lt;25 ng/mL'], ['&lt;17 μg/L', '&lt;25 μg/L'], 'prl'],
        ['Cortisol', ['0800 h: 5–23 μg/dL', '1600 h: 3–15 μg/dL', '2000 h: &lt;50% of 0800 h'], ['138–635 nmol/L', '82–413 nmol/L', 'Fraction of 0800 h: &lt;0.50'], 'glucocorticoid adrenal'],
        ['TSH', '0.4–4.0 μU/mL', '0.4–4.0 mIU/L', 'thyroid stimulating hormone thyrotropin'],
        ['Triiodothyronine (T<sub>3</sub>) (RIA)', '100–200 ng/dL', '1.5–3.1 nmol/L', 't3 thyroid'],
        ['Triiodothyronine (T<sub>3</sub>) resin uptake', '25%–35%', '0.25–0.35', 't3ru t3 thyroid'],
        ['Thyroxine (T<sub>4</sub>)', '5–12 μg/dL', '64–155 nmol/L', 't4 thyroid'],
        ['Free T<sub>4</sub>', '0.9–1.7 ng/dL', '12.0–21.9 pmol/L', 'ft4 t4 thyroid'],
        ['Thyroidal iodine (<sup>123</sup>I) uptake', '8%–30% of administered dose/24 h', '0.08–0.30/24 h', 'raiu radioactive iodine thyroid'],
        ['Intact PTH', '10–60 pg/mL', '10–60 ng/L', 'parathyroid hormone'],
        ['17-Hydroxycorticosteroids', [M + ' 3.0–10.0 mg/24 h', F + ' 2.0–8.0 mg/24 h'], ['8.2–27.6 μmol/24 h', '5.5–22.0 μmol/24 h'], '17-ohcs adrenal'],
        ['17-Ketosteroids, total', [M + ' 8–20 mg/24 h', F + ' 6–15 mg/24 h'], ['28–70 μmol/24 h', '21–52 μmol/24 h'], '17-ks androgen adrenal'],
      ]},
    ]},
    { id: 'abg', label: 'Blood Gases', sections: [
      { title: 'Gases, arterial blood (room air)', rows: [
        ['P<sub>O<sub>2</sub></sub>', '75–105 mm Hg', '10.0–14.0 kPa', 'po2 pao2 oxygen abg'],
        ['P<sub>CO<sub>2</sub></sub>', '33–45 mm Hg', '4.4–5.9 kPa', 'pco2 paco2 carbon dioxide abg'],
        ['pH', '7.35–7.45', '[H<sup>+</sup>] 36–44 nmol/L', 'abg acid base'],
      ]},
    ]},
    { id: 'csf', label: 'CSF', sections: [
      { title: 'Cerebrospinal fluid', rows: [
        ['Cell count', '0–5/mm<sup>3</sup>', '0–5 × 10<sup>6</sup>/L', 'csf wbc'],
        ['Chloride', '118–132 mEq/L', '118–132 mmol/L', 'csf cl'],
        ['Gamma globulin', '3%–12% total proteins', '0.03–0.12', 'csf igg'],
        ['Glucose', '40–70 mg/dL', '2.2–3.9 mmol/L', 'csf sugar'],
        ['Pressure', '70–180 mm H<sub>2</sub>O', '70–180 mm H<sub>2</sub>O', 'csf opening pressure lumbar puncture'],
        ['Proteins, total', '&lt;40 mg/dL', '&lt;0.40 g/L', 'csf protein'],
      ]},
    ]},
    { id: 'heme', label: 'Hematologic', sections: [
      { title: 'Complete blood count', rows: [
        ['Hematocrit', [M + ' 41%–53%', F + ' 36%–46%'], ['0.41–0.53', '0.36–0.46'], 'hct cbc'],
        ['Hemoglobin, blood', [M + ' 13.5–17.5 g/dL', F + ' 12.0–16.0 g/dL'], ['135–175 g/L', '120–160 g/L'], 'hgb hb cbc'],
        ['Mean corpuscular hemoglobin (MCH)', '25–35 pg/cell', '0.39–0.54 fmol/cell', 'mch cbc'],
        ['Mean corpuscular hemoglobin concentration (MCHC)', '31%–36% Hb/cell', '4.8–5.6 mmol Hb/L', 'mchc cbc'],
        ['Mean corpuscular volume (MCV)', '80–100 μm<sup>3</sup>', '80–100 fL', 'mcv cbc'],
        ['Volume, plasma', [M + ' 25–43 mL/kg', F + ' 28–45 mL/kg'], ['0.025–0.043 L/kg', '0.028–0.045 L/kg'], 'plasma volume'],
        ['Volume, red cell', [M + ' 20–36 mL/kg', F + ' 19–31 mL/kg'], ['0.020–0.036 L/kg', '0.019–0.031 L/kg'], 'rbc mass red cell mass'],
        ['Leukocyte count (WBC)', '4500–11,000/mm<sup>3</sup>', '4.5–11.0 × 10<sup>9</sup>/L', 'wbc white cells cbc'],
        ['Neutrophils, segmented', '54%–62%', '0.54–0.62', 'segs pmn differential diff', 1],
        ['Neutrophils, bands', '3%–5%', '0.03–0.05', 'bands differential diff', 1],
        ['Lymphocytes', '25%–33%', '0.25–0.33', 'lymphs differential diff', 1],
        ['Monocytes', '3%–7%', '0.03–0.07', 'monos differential diff', 1],
        ['Eosinophils', '1%–3%', '0.01–0.03', 'eos differential diff', 1],
        ['Basophils', '0%–0.75%', '0.00–0.0075', 'basos differential diff', 1],
        ['Platelet count', '150,000–400,000/mm<sup>3</sup>', '150–400 × 10<sup>9</sup>/L', 'plt platelets cbc'],
      ]},
      { title: 'Coagulation', rows: [
        ['Partial thromboplastin time (activated)', '25–40 seconds', '25–40 seconds', 'ptt aptt coag'],
        ['Prothrombin time (PT)', '11–15 seconds', '11–15 seconds', 'pt inr coag'],
        ['D-dimer', '≤250 ng/mL', '≤1.4 nmol/L', 'ddimer coag pe dvt'],
      ]},
      { title: 'Other, hematologic', rows: [
        ['Reticulocyte count', '0.5%–1.5%', '0.005–0.015', 'retic'],
        ['Erythrocyte count (RBC)', [M + ' 4.3–5.9 million/mm<sup>3</sup>', F + ' 3.5–5.5 million/mm<sup>3</sup>'], ['4.3–5.9 × 10<sup>12</sup>/L', '3.5–5.5 × 10<sup>12</sup>/L'], 'rbc red blood cells'],
        ['Erythrocyte sedimentation rate (Westergren)', [M + ' 0–15 mm/h', F + ' 0–20 mm/h'], ['0–15 mm/h', '0–20 mm/h'], 'esr sed rate'],
        ['CD4<sup>+</sup> T-lymphocyte count', '≥500/mm<sup>3</sup>', '≥0.5 × 10<sup>9</sup>/L', 'cd4 hiv t cell'],
        ['Hemoglobin A<sub>1c</sub>', '≤6%', '≤42 mmol/mol', 'a1c hba1c glycated diabetes endocrine'],
      ]},
    ]},
    { id: 'urine', label: 'Urine &amp; BMI', sections: [
      { title: 'Urine', rows: [
        ['Calcium', '100–300 mg/24 h', '2.5–7.5 mmol/24 h', 'urine ca'],
        ['Osmolality', '50–1200 mOsmol/kg H<sub>2</sub>O', '50–1200 mOsmol/kg H<sub>2</sub>O', 'urine osm'],
        ['Oxalate', '8–40 μg/mL', '90–445 μmol/L', 'urine'],
        ['Proteins, total', '&lt;150 mg/24 h', '&lt;0.15 g/24 h', 'urine protein proteinuria'],
      ]},
      { title: 'Body mass index', rows: [
        ['Body mass index (BMI)', 'Adult: 19–25 kg/m<sup>2</sup>', '', 'bmi weight'],
      ]},
    ]},
  ];

  const CSS = `
#lab-panel{position:fixed;z-index:900;top:64px;right:20px;width:min(640px,calc(100vw - 32px));height:min(620px,calc(100vh - 88px));
  min-width:320px;min-height:260px;display:none;flex-direction:column;overflow:hidden;resize:both;
  background:var(--surface,#fff);color:var(--ink,#202124);border:1px solid var(--line-strong,#c9ced6);border-radius:8px;
  box-shadow:var(--sh-modal,0 18px 50px rgba(20,24,33,.2));font-family:var(--font-ui,system-ui,sans-serif)}
#lab-panel.open{display:flex}
#lab-panel .lab-head{display:flex;align-items:center;gap:10px;padding:0 6px 0 14px;height:42px;flex:none;
  background:var(--spine,#24303e);color:#fff;cursor:move;user-select:none}
#lab-panel .lab-title{font-size:.88rem;font-weight:600;letter-spacing:.01em;flex:1}
#lab-panel .lab-close{width:32px;height:32px;border:none;background:none;color:rgba(255,255,255,.85);border-radius:5px;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
#lab-panel .lab-close:hover{background:rgba(255,255,255,.12);color:#fff}
#lab-panel .lab-close svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
#lab-panel .lab-tools{display:flex;align-items:center;gap:10px;padding:10px 12px;flex:none;border-bottom:1px solid var(--line,#e3e6ea)}
#lab-panel .lab-search{flex:1;position:relative}
#lab-panel .lab-search svg{position:absolute;left:10px;top:50%;width:15px;height:15px;transform:translateY(-50%);
  stroke:var(--ink-3,#8a919c);fill:none;stroke-width:1.8;pointer-events:none}
#lab-panel .lab-search input{width:100%;box-sizing:border-box;height:34px;padding:0 10px 0 32px;font:inherit;font-size:.86rem;
  color:var(--ink,#202124);background:var(--paper,#f7f8f9);border:1px solid var(--line-strong,#c9ced6);border-radius:6px;outline:none}
#lab-panel .lab-search input:focus{border-color:var(--accent,#2287d2);box-shadow:var(--ring,0 0 0 3px rgba(34,135,210,.28))}
#lab-panel .lab-si{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--ink-2,#5f6672);white-space:nowrap;cursor:pointer}
#lab-panel .lab-si input{accent-color:var(--accent,#2287d2);margin:0}
#lab-panel .lab-tabs{display:flex;gap:2px;padding:0 8px;flex:none;overflow-x:auto;border-bottom:1px solid var(--line,#e3e6ea);
  background:var(--paper,#f7f8f9);scrollbar-width:none}
#lab-panel .lab-tabs::-webkit-scrollbar{display:none}
#lab-panel .lab-tab{flex:none;padding:10px 12px 9px;font:inherit;font-size:.8rem;font-weight:500;color:var(--ink-2,#5f6672);
  background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap}
#lab-panel .lab-tab:hover{color:var(--ink,#202124)}
#lab-panel .lab-tab.active{color:var(--accent,#2287d2);border-bottom-color:var(--accent,#2287d2);font-weight:600}
#lab-panel .lab-tabs.searching .lab-tab{opacity:.45}
#lab-panel .lab-body{flex:1;overflow:auto;padding:4px 0 14px}
#lab-panel table{width:100%;border-collapse:collapse;font-size:.83rem;line-height:1.35}
#lab-panel th{position:sticky;top:-4px;z-index:1;text-align:left;font-size:.68rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-2,#5f6672);background:var(--surface,#fff);padding:10px 12px 6px;border-bottom:1px solid var(--line-strong,#c9ced6)}
#lab-panel td{padding:6px 12px;vertical-align:top;border-bottom:1px solid var(--line,#e3e6ea)}
#lab-panel td.n{font-weight:500;width:38%}
#lab-panel td.n.i1{padding-left:28px;font-weight:400}
#lab-panel td.r,#lab-panel td.s{font-variant-numeric:tabular-nums;white-space:nowrap}
#lab-panel td.s{color:var(--ink-2,#5f6672)}
#lab-panel.no-si .s{display:none}
#lab-panel tr.sec td{padding:14px 12px 5px;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--accent,#2287d2);border-bottom:1px solid var(--line-strong,#c9ced6);background:none}
#lab-panel tr.sec td .tabname{color:var(--ink-3,#8a919c);font-weight:600}
#lab-panel tbody tr:not(.sec):hover td{background:var(--accent-tint,#e8f2fb)}
#lab-panel sup,#lab-panel sub{font-size:.72em;line-height:0}
#lab-panel mark{background:color-mix(in srgb,var(--flag,#f59e42) 35%,transparent);color:inherit;border-radius:2px;padding:0 1px}
#lab-panel .lab-empty{padding:40px 16px;text-align:center;color:var(--ink-3,#8a919c);font-size:.86rem}
#lab-panel .lab-src{padding:12px 12px 0;font-size:.7rem;color:var(--ink-3,#8a919c)}
.lab-btn.active{background:rgba(255,255,255,.14);color:#fff}
@media (max-width:560px){#lab-panel{left:8px;right:8px;top:56px;width:auto;resize:none}#lab-panel td.n{width:auto}}
`;

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lines = v => Array.isArray(v) ? v : [v];
  const plain = html => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const norm = s => plain(s).toLowerCase().replace(/[₀-₉]/g, d => d.charCodeAt(0) - 8320).replace(/[^a-z0-9%+]+/g, ' ').trim();

  // Wrap matches of q in <mark>, touching only text outside tags.
  function highlight(html, q) {
    if (!q) return html;
    const re = new RegExp('\\b(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return html.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>')).join('');
  }

  let panel, body, tabsEl, input, activeTab = 'serum';

  function rowHtml(r, q) {
    const [name, ref, si, , indent] = r;
    return `<tr><td class="n${indent ? ' i1' : ''}">${highlight(name, q)}</td>` +
      `<td class="r">${lines(ref).join('<br>')}</td><td class="s">${lines(si).join('<br>')}</td></tr>`;
  }

  function render() {
    const raw = input.value.trim();
    const q = norm(raw);
    let html = '', hits = 0;
    if (!q) {
      const tab = TABS.find(t => t.id === activeTab);
      tab.sections.forEach(sec => {
        html += `<tr class="sec"><td colspan="3">${sec.title}</td></tr>` + sec.rows.map(r => rowHtml(r)).join('');
      });
    } else {
      const words = q.split(' ');
      TABS.forEach(tab => tab.sections.forEach(sec => {
        const rows = sec.rows.filter(r => {
          // Word-prefix match: "k" finds potassium/kinase, not "uptake".
          const hay = (norm(r[0]) + ' ' + (r[3] || '') + ' ' + norm(sec.title)).split(' ');
          return words.every(w => hay.some(h => h.startsWith(w)));
        });
        if (!rows.length) return;
        hits += rows.length;
        html += `<tr class="sec"><td colspan="3"><span class="tabname">${tab.label} ›</span> ${sec.title}</td></tr>` +
          rows.map(r => rowHtml(r, raw.length > 1 ? esc(raw) : '')).join('');
      }));
    }
    tabsEl.classList.toggle('searching', !!q);
    tabsEl.querySelectorAll('.lab-tab').forEach(b => b.classList.toggle('active', !q && b.dataset.tab === activeTab));
    body.innerHTML = (q && !hits)
      ? `<div class="lab-empty">No lab values match “${esc(raw)}”.</div>`
      : `<table><thead><tr><th>Test</th><th class="r">Reference range</th><th class="s">SI reference intervals</th></tr></thead><tbody>${html}</tbody></table>` +
        `<div class="lab-src">Source: NBME Laboratory Reference Values.</div>`;
    body.scrollTop = 0;
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    panel = document.createElement('div');
    panel.id = 'lab-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Lab values');
    panel.innerHTML = `
      <div class="lab-head"><span class="lab-title">Lab Values</span>
        <button class="lab-close" title="Close (Esc)" aria-label="Close lab values"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div>
      <div class="lab-tools">
        <label class="lab-search"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg>
          <input type="search" placeholder="Search lab values (e.g. sodium, BUN, TSH)" aria-label="Search lab values" autocomplete="off" spellcheck="false"></label>
        <label class="lab-si"><input type="checkbox" checked> SI units</label>
      </div>
      <div class="lab-tabs" role="tablist">${TABS.map(t => `<button class="lab-tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      <div class="lab-body"></div>`;
    document.body.appendChild(panel);

    body = panel.querySelector('.lab-body');
    tabsEl = panel.querySelector('.lab-tabs');
    input = panel.querySelector('.lab-search input');

    tabsEl.addEventListener('click', e => {
      const b = e.target.closest('.lab-tab');
      if (!b) return;
      activeTab = b.dataset.tab;
      input.value = '';
      render();
    });
    input.addEventListener('input', render);
    panel.querySelector('.lab-si input').addEventListener('change', e => panel.classList.toggle('no-si', !e.target.checked));
    panel.querySelector('.lab-close').addEventListener('click', () => toggle(false));

    // Keys typed in the panel must not reach the quiz (A–E answer, F flag, arrows navigate).
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (input.value) { input.value = ''; render(); } else toggle(false);
      }
      e.stopPropagation();
    });

    // Drag by the header.
    const head = panel.querySelector('.lab-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || innerWidth <= 560) return;
      const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = ev => {
        panel.style.left = Math.max(0, Math.min(innerWidth - 120, ev.clientX - dx)) + 'px';
        panel.style.top = Math.max(0, Math.min(innerHeight - 42, ev.clientY - dy)) + 'px';
        panel.style.right = 'auto';
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    render();
  }

  function toggle(force) {
    if (!panel) build();
    const open = force === undefined ? !panel.classList.contains('open') : force;
    // Until the user drags it, open just below the quiz toolbar (its height differs per skin).
    if (open && !panel.style.left && innerWidth > 560) {
      const bar = document.querySelector('.topbar');
      const top = (bar ? bar.getBoundingClientRect().bottom : 56) + 8;
      panel.style.top = top + 'px';
      panel.style.height = Math.max(260, Math.min(620, innerHeight - top - 76)) + 'px';
    }
    panel.classList.toggle('open', open);
    document.querySelectorAll('.lab-btn').forEach(b => b.classList.toggle('active', open));
    if (open) { input.focus(); input.select(); }
  }

  window.toggleLabValues = toggle;
})();
