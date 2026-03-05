const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/midnight_train/Downloads/最新データ.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

const TOKEN = process.env.SUPABASE_TOKEN || '';
const REF = 'plrmqgcigzjuiovsbggf';

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'},
    body: JSON.stringify({query:sql})
  });
  if (!r.ok) throw new Error('DB error: ' + r.status);
  return r.json();
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  let s = String(v).trim();
  if (s === '' || s === '-' || s === '#N/A' || s === '#REF!' || s === '#VALUE!' || s === '#DIV/0!' || s === 'None') return 'NULL';
  return "'" + s.replace(/'/g, "''") + "'";
}

function escNum(v) {
  if (v === null || v === undefined) return 'NULL';
  let s = String(v).replace(/[,¥￥%]/g, '').trim();
  if (s === '' || s === '-' || s === '#N/A') return 'NULL';
  const n = parseFloat(s);
  return isNaN(n) ? 'NULL' : String(n);
}

async function main() {
  const fixes = [
    { row: 2, email: 'sara0531.h@gmail.com', updates: {
      customers: { utm_source: {col:4,type:'text'}, utm_medium: {col:5,type:'text'}, target_firm_type: {col:88,type:'text'} },
    }},
    { row: 4, email: 'hideo.aoki1991@gmail.com', updates: {
      customers: { name: {col:1,type:'text'}, attribute: {col:8,type:'text'}, target_firm_type: {col:88,type:'text'} },
    }},
    { row: 6, email: 'ayano.sparkle@gmail.com', updates: {
      customers: { phone: {col:3,type:'text'}, utm_source: {col:4,type:'text'}, utm_medium: {col:5,type:'text'}, attribute: {col:8,type:'text'} },
    }},
    { row: 10, email: 'shiryu0046@gmail.com', updates: {
      contracts: { confirmed_amount: {col:36,type:'number'} },
      learning_records: { contract_months: {col:46,type:'number'}, total_sessions: {col:47,type:'number'}, enrollment_reason: {col:66,type:'text'} },
      agent_records: { agent_memo: {col:67,type:'text'} },
    }},
    { row: 38, email: 'yuki.nagai64@gmail.com', updates: {
      contracts: { confirmed_amount: {col:36,type:'number'} },
      learning_records: { completed_sessions: {col:49,type:'number'} },
    }},
    { row: 62, email: 'yuya.proposito@gmail.com', updates: {
      sales_pipeline: { decision_factor: {col:14,type:'text'} },
    }},
    { row: 78, email: 'liuweicyk@gmail.com', updates: {
      learning_records: { completed_sessions: {col:49,type:'number'}, level_case: {col:54,type:'text'}, level_mck: {col:55,type:'text'} },
    }},
    { row: 120, email: 'zacceydesuyo@gmail.com', updates: {
      learning_records: { completed_sessions: {col:49,type:'number'}, level_case: {col:54,type:'text'} },
    }},
  ];

  for (const fix of fixes) {
    const row = data[fix.row];
    const email = fix.email;

    const cust = await q("SELECT ce.customer_id FROM customer_emails ce WHERE ce.email = '" + email + "'");
    if (cust.length === 0) { console.log('SKIP (not found):', email); continue; }
    const cid = cust[0].customer_id;

    for (const [table, cols] of Object.entries(fix.updates)) {
      const sets = [];
      for (const [colName, info] of Object.entries(cols)) {
        const val = row[info.col];
        if (info.type === 'number') {
          sets.push(colName + ' = ' + escNum(val));
        } else {
          sets.push(colName + ' = ' + esc(val));
        }
      }
      sets.push("updated_at = now()");

      const sql = 'UPDATE ' + table + ' SET ' + sets.join(', ') + " WHERE customer_id = '" + cid + "'";
      await q(sql);
      console.log('Fixed', email, '-', table, ':', Object.keys(cols).join(', '));
    }
  }

  console.log('\nAll 8 records fixed.');
}

main().catch(e => console.error('ERROR:', e.message));
