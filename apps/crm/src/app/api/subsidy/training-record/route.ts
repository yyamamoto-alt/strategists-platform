import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 修了条件の評価レベル（合格ライン）
const PASSING_EVALUATIONS = [
  "内定獲得圏内レベル",
  "内定獲得十分レベル",
  "内定獲得確実レベル",
];

interface TrainingRecordResponse {
  customer: {
    id: string;
    name: string;
    attribute: string;
    planName: string;
    enrollmentDate: string | null;
  };
  careerConsultations: {
    number: number;
    date: string;
    counselor: string;
    type: string;
    rawData: Record<string, string>;
  }[];
  caseCoachings: {
    number: number;
    date: string;
    mentor: string;
    evaluation: string | null;
    topic: string;
    goodPoints: string;
    improvements: string;
    rawData: Record<string, string>;
  }[];
  materialSubmission: {
    submitted: boolean;
    date: string | null;
  };
  completionConditions: {
    caseCoachingMet: boolean;
    caseCoachingCount: number;
    careerConsultationMet: boolean;
    careerConsultationCount: number;
    materialMet: boolean;
    evaluationMet: boolean;
    bestEvaluation: string | null;
    allMet: boolean;
    completionDate: string | null;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. 顧客情報を取得
  const { data: customer, error: customerError } = await db
    .from("customers")
    .select("id, name, attribute")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return NextResponse.json(
      { error: "顧客が見つかりません" },
      { status: 404 }
    );
  }

  // 2. 契約情報を取得
  const { data: contracts } = await db
    .from("contracts")
    .select("plan_name, subsidy_eligible")
    .eq("customer_id", customerId)
    .limit(1);

  const contract = contracts?.[0] || null;

  // 3. 営業パイプライン情報を取得
  const { data: pipeline } = await db
    .from("sales_pipeline")
    .select("sales_date, sales_person")
    .eq("customer_id", customerId)
    .limit(1);

  const pipelineData = pipeline?.[0] || null;

  // 4. application_history からレコードを取得
  const { data: records, error: recordsError } = await db
    .from("application_history")
    .select("*")
    .eq("customer_id", customerId)
    .in("source", [
      "メンター指導報告",
      "営業報告",
      "エージェント面談報告フォーム",
      "教材アウトプット",
    ])
    .order("applied_at", { ascending: true });

  if (recordsError) {
    console.error("Failed to fetch application_history:", recordsError);
    return NextResponse.json(
      { error: "受講記録の取得に失敗しました" },
      { status: 500 }
    );
  }

  const allRecords = records || [];

  // === 振り分けロジック ===

  // 分類用の一時配列
  const salesReports: typeof allRecords = []; // 営業報告
  const behaviorRecords: typeof allRecords = []; // ビヘイビア
  const additionalRecords: typeof allRecords = []; // 追加指導
  const agentRecords: typeof allRecords = []; // エージェント面談報告
  const assessmentRecords: typeof allRecords = []; // アセスメント
  const numericMentorRecords: typeof allRecords = []; // 数字回次のメンター指導
  const materialRecords: typeof allRecords = []; // 教材アウトプット

  for (const record of allRecords) {
    const raw = record.raw_data || {};
    const source = record.source as string;
    const sessionNumber = (raw["回次（合計指導回数）"] || raw["回次"] || "").toString();

    if (source === "営業報告") {
      salesReports.push(record);
    } else if (source === "エージェント面談報告フォーム") {
      agentRecords.push(record);
    } else if (source === "教材アウトプット") {
      materialRecords.push(record);
    } else if (source === "メンター指導報告") {
      if (sessionNumber.includes("ビヘイビア")) {
        behaviorRecords.push(record);
      } else if (sessionNumber === "追加指導") {
        additionalRecords.push(record);
      } else if (sessionNumber.includes("アセスメント")) {
        assessmentRecords.push(record);
      } else if (/\d/.test(sessionNumber)) {
        numericMentorRecords.push(record);
      } else {
        // その他の回次 → ケース指導扱い
        numericMentorRecords.push(record);
      }
    }
  }

  // === キャリア相談の組み立て ===
  // 1. 営業報告 → 初回キャリア面談
  // 2. ビヘイビア → キャリア相談
  // 3. 追加指導 → キャリア相談
  // 4. エージェント面談 → キャリア相談
  // 5. キャリア相談が2回未満の場合のみ、アセスメントを充当

  interface CareerItem {
    date: string;
    counselor: string;
    type: string;
    rawData: Record<string, string>;
  }

  const careerItems: CareerItem[] = [];

  // 営業報告 → 初回キャリア面談
  for (const r of salesReports) {
    const raw = r.raw_data || {};
    careerItems.push({
      date: raw["実施日"] || r.applied_at || "",
      counselor: raw["営業担当者名"] || raw["担当者"] || pipelineData?.sales_person || "",
      type: "初回キャリア面談",
      rawData: raw,
    });
  }

  // ビヘイビア → キャリア相談
  for (const r of behaviorRecords) {
    const raw = r.raw_data || {};
    careerItems.push({
      date: raw["指導日"] || r.applied_at || "",
      counselor: raw["メンター名"] || raw["担当メンター"] || "",
      type: "キャリア相談",
      rawData: raw,
    });
  }

  // 追加指導 → キャリア相談
  for (const r of additionalRecords) {
    const raw = r.raw_data || {};
    careerItems.push({
      date: raw["指導日"] || r.applied_at || "",
      counselor: raw["メンター名"] || raw["担当メンター"] || "",
      type: "キャリア相談",
      rawData: raw,
    });
  }

  // エージェント面談 → キャリア相談
  for (const r of agentRecords) {
    const raw = r.raw_data || {};
    careerItems.push({
      date: raw["タイムスタンプ"] || r.applied_at || "",
      counselor: raw["担当者"] || raw["CA名"] || "",
      type: "キャリア相談",
      rawData: raw,
    });
  }

  // アセスメントの充当判定: キャリア相談が2回未満の場合のみ
  const assessmentsForCareer: typeof allRecords = [];
  const assessmentsForCase: typeof allRecords = [];

  if (careerItems.length < 2) {
    const needed = 2 - careerItems.length;
    for (let i = 0; i < assessmentRecords.length; i++) {
      if (i < needed) {
        assessmentsForCareer.push(assessmentRecords[i]);
      } else {
        assessmentsForCase.push(assessmentRecords[i]);
      }
    }
  } else {
    // キャリア相談が既に2回以上 → 全アセスメントをケース指導へ
    assessmentsForCase.push(...assessmentRecords);
  }

  // アセスメント → キャリア相談に充当
  for (const r of assessmentsForCareer) {
    const raw = r.raw_data || {};
    careerItems.push({
      date: raw["指導日"] || r.applied_at || "",
      counselor: raw["メンター名"] || raw["担当メンター"] || "",
      type: "キャリア相談",
      rawData: raw,
    });
  }

  // 日付順ソート
  careerItems.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // 連番振り＋type修正（初回のみ「初回キャリア面談」、以降「キャリア相談」）
  const careerConsultations = careerItems.map((item, idx) => ({
    number: idx + 1,
    date: item.date,
    counselor: item.counselor,
    type: idx === 0 ? "初回キャリア面談" : "キャリア相談",
    rawData: item.rawData,
  }));

  // === ケース指導の組み立て ===
  interface CaseItem {
    date: string;
    mentor: string;
    evaluation: string | null;
    topic: string;
    goodPoints: string;
    improvements: string;
    rawData: Record<string, string>;
  }

  const caseItems: CaseItem[] = [];

  // 数字回次のメンター指導 → ケース指導
  for (const r of numericMentorRecords) {
    const raw = r.raw_data || {};
    caseItems.push({
      date: raw["指導日"] || r.applied_at || "",
      mentor: raw["メンター名"] || raw["担当メンター"] || "",
      evaluation: raw["総合評価（社内限り）"] || raw["評価"] || null,
      topic: raw["解いた問題"] || raw["指導内容"] || "",
      goodPoints: raw["よかった点・成長した点"] || raw["良かった点"] || "",
      improvements: raw["課題・改善点"] || raw["改善点"] || "",
      rawData: raw,
    });
  }

  // キャリア相談に充当されなかったアセスメント → ケース指導
  for (const r of assessmentsForCase) {
    const raw = r.raw_data || {};
    caseItems.push({
      date: raw["指導日"] || r.applied_at || "",
      mentor: raw["メンター名"] || raw["担当メンター"] || "",
      evaluation: raw["総合評価（社内限り）"] || raw["評価"] || null,
      topic: raw["解いた問題"] || raw["指導内容"] || "",
      goodPoints: raw["よかった点・成長した点"] || raw["良かった点"] || "",
      improvements: raw["課題・改善点"] || raw["改善点"] || "",
      rawData: raw,
    });
  }

  // 日付順ソートして連番
  caseItems.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const caseCoachings = caseItems.map((item, idx) => ({
    number: idx + 1,
    date: item.date,
    mentor: item.mentor,
    evaluation: item.evaluation,
    topic: item.topic,
    goodPoints: item.goodPoints,
    improvements: item.improvements,
    rawData: item.rawData,
  }));

  // === 教材提出 ===
  const materialSubmission = {
    submitted: materialRecords.length > 0,
    date: materialRecords.length > 0
      ? (materialRecords[0].raw_data?.["タイムスタンプ"] ||
         materialRecords[0].applied_at ||
         null)
      : null,
  };

  // === 入塾フォームのタイムスタンプ取得 ===
  const { data: enrollmentRecords } = await db
    .from("application_history")
    .select("applied_at, raw_data")
    .eq("customer_id", customerId)
    .eq("source", "入塾フォーム")
    .order("applied_at", { ascending: true })
    .limit(1);

  const enrollmentDate =
    enrollmentRecords?.[0]?.raw_data?.["タイムスタンプ"] ||
    enrollmentRecords?.[0]?.applied_at ||
    null;

  // === 修了条件 ===
  const caseCoachingCount = caseCoachings.length;
  const careerConsultationCount = careerConsultations.length;
  const caseCoachingMet = caseCoachingCount >= 4;
  const careerConsultationMet = careerConsultationCount >= 2;
  const materialMet = materialSubmission.submitted;

  // 評価チェック
  const evaluations = caseCoachings
    .map((c) => c.evaluation)
    .filter((e): e is string => e !== null);

  const passingEvals = evaluations.filter((e) =>
    PASSING_EVALUATIONS.some((pe) => e.includes(pe))
  );
  const evaluationMet = passingEvals.length > 0;

  // 最高評価を決定（確実 > 十分 > 圏内）
  const evalPriority = [
    "内定獲得確実レベル",
    "内定獲得十分レベル",
    "内定獲得圏内レベル",
  ];
  let bestEvaluation: string | null = null;
  for (const pe of evalPriority) {
    if (evaluations.some((e) => e.includes(pe))) {
      bestEvaluation = pe;
      break;
    }
  }

  const allMet =
    caseCoachingMet && careerConsultationMet && materialMet && evaluationMet;

  // 修了日 = 全条件が揃った最後のレコードの日付
  let completionDate: string | null = null;
  if (allMet) {
    // 全条件を達成した各条件の最後の日付のうち、最も遅いもの
    const allDates: string[] = [];

    // ケース指導4回目の日付
    if (caseCoachings.length >= 4) {
      allDates.push(caseCoachings[3].date);
    }

    // キャリア相談2回目の日付
    if (careerConsultations.length >= 2) {
      allDates.push(careerConsultations[1].date);
    }

    // 教材提出の日付
    if (materialSubmission.date) {
      allDates.push(materialSubmission.date);
    }

    // 評価条件を初めて達成した日付
    const firstPassingCoaching = caseCoachings.find(
      (c) =>
        c.evaluation !== null &&
        PASSING_EVALUATIONS.some((pe) => c.evaluation!.includes(pe))
    );
    if (firstPassingCoaching) {
      allDates.push(firstPassingCoaching.date);
    }

    // 最も遅い日付 = 修了日
    if (allDates.length > 0) {
      allDates.sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      completionDate = allDates[0];
    }
  }

  const response: TrainingRecordResponse = {
    customer: {
      id: customer.id,
      name: customer.name,
      attribute: customer.attribute || "",
      planName: contract?.plan_name || "",
      enrollmentDate,
    },
    careerConsultations,
    caseCoachings,
    materialSubmission,
    completionConditions: {
      caseCoachingMet,
      caseCoachingCount,
      careerConsultationMet,
      careerConsultationCount,
      materialMet,
      evaluationMet,
      bestEvaluation,
      allMet,
      completionDate,
    },
  };

  return NextResponse.json(response);
}
