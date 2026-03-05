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
  return r.json();
}

async function main() {
  // 成約者の重複5組 + 全28組チェック
  const targets = [
    { email: 'd11280126126@gmail.com', name: '安田大蔵/鈴木涼太', rows: [55, 136], priority: '成約' },
    { email: 'lala.riko.lala@gmail.com', name: '石綿莉子', rows: [92, 573], priority: '成約' },
    { email: 'keyinchan@outlook.com', name: 'チェン', rows: [247, 268, 667], priority: '成約' },
    { email: 'mari.aoki.1110@gmail.com', name: '青木麻莉', rows: [952, 1119], priority: '成約' },
    { email: 'shin120121@gmail.com', name: '野原智哉', rows: [1040, 1104], priority: '成約' },
  ];

  for (const t of targets) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`【${t.priority}】${t.name} (${t.email})`);

    // Excel data
    console.log('\n【Excel各行】');
    for (const i of t.rows) {
      const r = data[i];
      let dateStr = '';
      if (typeof r[0] === 'number') {
        const d = new Date((r[0] - 25569) * 86400 * 1000);
        dateStr = d.toISOString().split('T')[0];
      }
      console.log(`  Row ${i+1} (${dateStr}) ${r[1]}`);
      console.log(`    stage=${r[12]} | deal=${r[15]} | 確定売上=${r[36]} | プラン=${r[40]}`);
      console.log(`    属性=${r[8]} | メンター=${r[41]} | 契約月=${r[46]} | 指導回数=${r[47]} | 完了=${r[49]}`);
      console.log(`    受講状況=${r[39]} | 人材区分=${r[33]} | 想定年収=${r[78]}`);
    }

    // DB data
    const sql = `SELECT c.name, c.attribute, c.application_date,
      sp.stage, sp.deal_status, sp.sales_person,
      ct.confirmed_amount, ct.plan_name, ct.enrollment_status, ct.referral_category,
      lr.mentor_name, lr.contract_months, lr.total_sessions, lr.completed_sessions,
      ar.offer_salary
      FROM customers c
      LEFT JOIN customer_emails ce ON c.id = ce.customer_id
      LEFT JOIN sales_pipeline sp ON c.id = sp.customer_id
      LEFT JOIN contracts ct ON c.id = ct.customer_id
      LEFT JOIN learning_records lr ON c.id = lr.customer_id
      LEFT JOIN agent_records ar ON c.id = ar.customer_id
      WHERE ce.email = '${t.email}'`;

    const db = await q(sql);

    if (db.length > 0) {
      const d = db[0];
      console.log('\n【DB】');
      console.log(`    name=${d.name} | 属性=${d.attribute} | 申込日=${d.application_date || '-'}`);
      console.log(`    stage=${d.stage} | deal=${d.deal_status} | 確定売上=${d.confirmed_amount} | プラン=${d.plan_name}`);
      console.log(`    メンター=${d.mentor_name} | 契約月=${d.contract_months} | 指導回数=${d.total_sessions} | 完了=${d.completed_sessions}`);
      console.log(`    受講状況=${d.enrollment_status} | 人材区分=${d.referral_category} | 想定年収=${d.offer_salary}`);

      // 成約行（最もデータが充実している行）を特定
      let bestRow = null;
      for (const i of t.rows) {
        const r = data[i];
        if (r[12] === '成約' || (r[36] && r[36] > 0 && r[12] !== '日程未確')) {
          if (!bestRow || (data[bestRow][36] || 0) < (r[36] || 0) || data[bestRow][12] !== '成約') {
            bestRow = i;
          }
        }
      }
      if (!bestRow) bestRow = t.rows[0]; // fallback to first row

      const best = data[bestRow];
      console.log(`\n【判定】正しい行 = Row ${bestRow+1} (${best[1]})`);

      const issues = [];
      if (d.name !== best[1]) issues.push(`名前: DB=${d.name} → Excel=${best[1]}`);
      if (d.stage !== best[12] && best[12]) issues.push(`stage: DB=${d.stage} → Excel=${best[12]}`);
      if (d.deal_status !== best[15] && best[15]) issues.push(`deal: DB=${d.deal_status} → Excel=${best[15]}`);
      if (Number(d.confirmed_amount) !== Number(best[36] || 0)) issues.push(`確定売上: DB=${d.confirmed_amount} → Excel=${best[36]}`);
      if (d.plan_name !== best[40] && best[40]) issues.push(`プラン: DB=${d.plan_name} → Excel=${best[40]}`);
      if (d.attribute !== best[8] && best[8]) issues.push(`属性: DB=${d.attribute} → Excel=${best[8]}`);
      if (d.enrollment_status !== best[39] && best[39]) issues.push(`受講状況: DB=${d.enrollment_status} → Excel=${best[39]}`);
      if (d.mentor_name !== best[41] && best[41]) issues.push(`メンター: DB=${d.mentor_name} → Excel=${best[41]}`);
      if (Number(d.contract_months || 0) !== Number(best[46] || 0) && best[46]) issues.push(`契約月: DB=${d.contract_months} → Excel=${best[46]}`);
      if (Number(d.total_sessions || 0) !== Number(best[47] || 0) && best[47]) issues.push(`指導回数: DB=${d.total_sessions} → Excel=${best[47]}`);
      if (Number(d.completed_sessions || 0) !== Number(best[49] || 0) && best[49] && typeof best[49] === 'number') issues.push(`完了数: DB=${d.completed_sessions} → Excel=${best[49]}`);

      if (issues.length === 0) {
        console.log('  ✅ 成約行のデータと一致');
      } else {
        console.log('  ❌ 不一致あり:');
        for (const issue of issues) {
          console.log('    ' + issue);
        }
      }
    } else {
      console.log('\n  ⚠️ DBにレコードなし');
    }
    console.log('');
  }
}

main().catch(e => console.error('ERROR:', e.message));
