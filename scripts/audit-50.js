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

// 前回は step=39 で 30件。今回は別の位置から50件
// Row 5,10,15,20,25, 50,60,70,...,200, 250,300,...,1100 など散らす
const sampleRows = [];
// 前半: 3,7,11,15,19,23,27,31,35,39 (10件)
for (let i = 3; i <= 39; i += 4) sampleRows.push(i);
// 中間: 45,55,65,...,195 (16件)
for (let i = 45; i <= 195; i += 10) sampleRows.push(i);
// 後半: 220,270,320,...,1120 (19件)
for (let i = 220; i <= 1120; i += 50) sampleRows.push(i);
// ラスト5件
for (let i = 1140; i <= 1170; i += 8) sampleRows.push(i);

// filter valid
const validRows = sampleRows.filter(i => i < data.length && data[i] && data[i][2]);
console.log('Checking', validRows.length, 'records...\n');

const checks = [
  [1, 'customers', 'name', '名前', 'text'],
  [3, 'customers', 'phone', '電話番号', 'text'],
  [4, 'customers', 'utm_source', 'utm_source', 'text'],
  [5, 'customers', 'utm_medium', 'utm_medium', 'text'],
  [8, 'customers', 'attribute', '属性', 'text'],
  [9, 'customers', 'career_history', '経歴', 'text'],
  [17, 'customers', 'application_reason', '申込の決め手', 'text'],
  [87, 'customers', 'target_companies', '志望企業', 'text'],
  [88, 'customers', 'target_firm_type', '対策ファーム', 'text'],
  [89, 'customers', 'initial_level', '申込時レベル', 'text'],
  [129, 'customers', 'transfer_intent', '転職意向', 'text'],
  [130, 'customers', 'university', '大学名', 'text'],
  [10, 'sales_pipeline', 'agent_interest_at_application', '申込時エージェント', 'text'],
  [12, 'sales_pipeline', 'stage', '検討状況', 'text'],
  [14, 'sales_pipeline', 'decision_factor', '検討・失注理由', 'text'],
  [15, 'sales_pipeline', 'deal_status', '実施状況', 'text'],
  [16, 'sales_pipeline', 'initial_channel', '初回認知経路', 'text'],
  [21, 'sales_pipeline', 'sales_person', '営業担当', 'text'],
  [22, 'sales_pipeline', 'sales_content', '営業内容', 'text'],
  [23, 'sales_pipeline', 'sales_strategy', '営業方針', 'text'],
  [24, 'sales_pipeline', 'jicoo_message', 'jicooメッセージ', 'text'],
  [25, 'sales_pipeline', 'agent_confirmation', 'エージェント利用意向', 'text'],
  [27, 'sales_pipeline', 'sales_route', '経路(営業)', 'text'],
  [28, 'sales_pipeline', 'comparison_services', '比較サービス', 'text'],
  [33, 'contracts', 'referral_category', '人材紹介区分', 'text'],
  [34, 'contracts', 'referral_status', '紹介ステータス', 'text'],
  [36, 'contracts', 'confirmed_amount', '確定売上', 'number'],
  [37, 'contracts', 'discount', '割引', 'number'],
  [39, 'contracts', 'enrollment_status', '受講状況', 'text'],
  [40, 'contracts', 'plan_name', 'プラン名', 'text'],
  [41, 'learning_records', 'mentor_name', 'メンター', 'text'],
  [46, 'learning_records', 'contract_months', '契約月数', 'number'],
  [47, 'learning_records', 'total_sessions', '契約指導回数', 'number'],
  [49, 'learning_records', 'completed_sessions', '指導完了数', 'number'],
  [53, 'learning_records', 'level_fermi', 'フェルミ', 'text'],
  [54, 'learning_records', 'level_case', 'ケース', 'text'],
  [55, 'learning_records', 'level_mck', 'McK', 'text'],
  [57, 'learning_records', 'selection_status', '選考状況', 'text'],
  [65, 'learning_records', 'coaching_requests', '指導要望', 'text'],
  [66, 'learning_records', 'enrollment_reason', '入会理由', 'text'],
  [67, 'agent_records', 'agent_memo', 'エージェント業務メモ', 'text'],
  [74, 'agent_records', 'offer_company', '内定先', 'text'],
  [75, 'agent_records', 'external_agents', '利用エージェント', 'text'],
  [78, 'agent_records', 'offer_salary', '想定年収', 'number'],
  [82, 'agent_records', 'general_memo', 'メモ', 'text'],
  [117, 'agent_records', 'loss_reason', 'エージェント失注理由', 'text'],
  [136, 'agent_records', 'agent_staff', 'エージェント担当', 'text'],
  [140, 'agent_records', 'placement_confirmed', '人材確定', 'text'],
];

function norm(val) {
  if (val === undefined || val === null) return null;
  let s = String(val).trim();
  if (s === '' || s === '-' || s === '#N/A' || s === '#REF!' || s === '#VALUE!' || s === '#DIV/0!' || s === 'None') return null;
  return s;
}

function match(excelRaw, dbRaw, type) {
  const e = norm(excelRaw);
  const d = norm(dbRaw);
  if (e === null && d === null) return true;
  if (e === null || d === null) {
    // Excel has data but DB doesn't = problem
    // DB has data but Excel doesn't = OK (could be from forms)
    if (e !== null && d === null) return false;
    return true; // DB has extra, fine
  }
  if (type === 'number') {
    const en = parseFloat(String(e).replace(/[,¥￥%]/g, ''));
    const dn = parseFloat(d);
    if (!isNaN(en) && !isNaN(dn)) return Math.abs(en - dn) < 1;
  }
  // Text: compare first 150 chars, normalize whitespace
  const ec = e.replace(/\s+/g, ' ').substring(0, 150);
  const dc = d.replace(/\s+/g, ' ').substring(0, 150);
  return ec === dc;
}

async function main() {
  const emails = validRows.map(i => String(data[i][2]).trim().toLowerCase());
  const emailList = emails.map(e => "'" + e.replace(/'/g,"''") + "'").join(',');
  
  const [custData, pipeData, contData, learnData, agentData] = await Promise.all([
    q("SELECT c.*, ce.email FROM customers c JOIN customer_emails ce ON c.id = ce.customer_id WHERE ce.email IN ("+emailList+")"),
    q("SELECT sp.*, ce.email FROM sales_pipeline sp JOIN customer_emails ce ON sp.customer_id = ce.customer_id WHERE ce.email IN ("+emailList+")"),
    q("SELECT ct.*, ce.email FROM contracts ct JOIN customer_emails ce ON ct.customer_id = ce.customer_id WHERE ce.email IN ("+emailList+")"),
    q("SELECT lr.*, ce.email FROM learning_records lr JOIN customer_emails ce ON lr.customer_id = ce.customer_id WHERE ce.email IN ("+emailList+")"),
    q("SELECT ar.*, ce.email FROM agent_records ar JOIN customer_emails ce ON ar.customer_id = ce.customer_id WHERE ce.email IN ("+emailList+")"),
  ]);
  
  const byEmail = (arr) => { const m = {}; for (const r of arr) m[r.email] = r; return m; };
  const tableMap = {
    customers: byEmail(custData),
    sales_pipeline: byEmail(pipeData),
    contracts: byEmail(contData),
    learning_records: byEmail(learnData),
    agent_records: byEmail(agentData),
  };
  
  let totalChecked = 0, totalMismatch = 0, totalMissing = 0;
  const mismatchDetail = {};
  const allMismatches = [];

  for (const rowIdx of validRows) {
    const row = data[rowIdx];
    const email = String(row[2]).trim().toLowerCase();
    const name = row[1] || '?';
    
    if (!tableMap.customers[email]) {
      totalMissing++;
      console.log('MISSING Row ' + (rowIdx+1) + ': ' + name + ' (' + email + ')');
      continue;
    }
    totalChecked++;
    
    const rowIssues = [];
    for (const [colIdx, table, col, label, type] of checks) {
      const record = tableMap[table][email];
      if (!record) continue;
      
      if (!match(row[colIdx], record[col], type)) {
        const e = norm(row[colIdx]);
        const d = norm(record[col]);
        rowIssues.push({ label, excel: e ? String(e).substring(0,50) : '(null)', db: d ? String(d).substring(0,50) : '(null)' });
        totalMismatch++;
        mismatchDetail[label] = (mismatchDetail[label] || 0) + 1;
      }
    }
    
    if (rowIssues.length > 0) {
      const line = 'Row ' + (rowIdx+1) + ' ' + name + ' (' + email + ') — ' + rowIssues.length + '件';
      allMismatches.push(line);
      console.log('\n' + line);
      for (const m of rowIssues) {
        console.log('  ' + m.label + ': Excel="' + m.excel + '" vs DB="' + m.db + '"');
      }
    }
  }
  
  console.log('\n========================================');
  console.log('  追加50件サンプル検証結果');
  console.log('========================================');
  console.log('チェック対象:', validRows.length, '件');
  console.log('照合成功:', totalChecked);
  console.log('DB未発見:', totalMissing);
  console.log('不一致フィールド総数:', totalMismatch);
  console.log('不一致があったレコード数:', allMismatches.length);
  
  if (Object.keys(mismatchDetail).length > 0) {
    console.log('\nカラム別不一致:');
    Object.entries(mismatchDetail).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ': ' + v + '件'));
  } else {
    console.log('\n全フィールド一致！');
  }
}

main().catch(e => console.error('ERROR:', e.message));
