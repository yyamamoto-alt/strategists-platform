/**
 * Notion APIからカリキュラムデータを取得してSupabaseに投入するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/seed-curriculum-from-notion.ts
 *
 * 環境変数:
 *   NOTION_TOKEN - Notion Internal Integration Token
 *   SUPABASE_URL - Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key
 */

import { createClient } from "@supabase/supabase-js";

// ============================================
// 設定
// ============================================
const NOTION_TOKEN = process.env.NOTION_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://plrmqgcigzjuiovsbggf.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const NOTION_API = "https://api.notion.com/v1";
const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
};

// ============================================
// 新卒カリキュラム DB IDs
// ============================================
const SHINSOTSU_DBS = {
  standard_light: "2bc42aed-d74b-80c8-9783-d5796aefab46", // スタンダード/ライト (38項目)
  minimum: "2cb42aed-d74b-812d-8984-cdf56a2189be",         // ミニマム (26項目)
  senkomu: "2c442aed-d74b-818d-a70a-ecb5e9b5cc48",         // 選コミュ (9項目)
};

// ============================================
// 中途ポータルコンテンツ定義
// ============================================
const KISOTSU_COURSES: {
  title: string;
  category: string;
  description: string;
  target_plans: string[];  // plan slugs
}[] = [
  {
    title: "ケース面接の教科書(2025最新版)",
    category: "教科書",
    description: "ケース面接の基本から応用まで網羅した教科書",
    target_plans: ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
  },
  {
    title: "フェルミ推定の教科書【完全版】",
    category: "教科書",
    description: "フェルミ推定の体系的な学習教材",
    target_plans: [],  // 全プラン公開
  },
  {
    title: "総コン内定の教科書",
    category: "教科書",
    description: "総合コンサルティングファーム向け対策教材",
    target_plans: [],  // 全プラン公開
  },
  {
    title: "マッキンゼー/論点設計の教科書",
    category: "教科書",
    description: "マッキンゼー・戦略ファーム向け論点設計の教材",
    target_plans: ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
  },
  {
    title: "ケース面接対策動画講座",
    category: "動画講座",
    description: "ケース面接の解き方を動画で学ぶ講座（全7講）",
    target_plans: [],  // 全プラン公開
  },
  {
    title: "フェルミ推定対策動画講座",
    category: "動画講座",
    description: "フェルミ推定の解き方を動画で学ぶ講座（全4講）",
    target_plans: [],  // 全プラン公開
  },
  {
    title: "マッキンゼー予想問題動画講座",
    category: "動画講座",
    description: "マッキンゼーの出題傾向と予想問題の解説",
    target_plans: ["kisotsu_long", "kisotsu_standard", "kisotsu_short", "kisotsu_express", "kisotsu_subsidy"],
  },
  {
    title: "Webテスト対策",
    category: "補助教材",
    description: "コンサルティングファームのWebテスト対策",
    target_plans: [],
  },
  {
    title: "課題別「筋の良い打ち手」の方向性",
    category: "補助教材",
    description: "ケース面接で使える打ち手のパターン集",
    target_plans: [],
  },
  {
    title: "推奨図書リスト",
    category: "補助教材",
    description: "コンサル転職に役立つ推奨図書一覧",
    target_plans: [],
  },
  {
    title: "業界・商材別キードライバー一覧",
    category: "補助教材",
    description: "業界ごとの売上・利益ドライバー整理",
    target_plans: [],
  },
];

// ============================================
// Notion API ヘルパー
// ============================================

interface NotionPage {
  id: string;
  properties: Record<string, any>;
}

async function queryNotionDatabase(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Notion API error for DB ${databaseId}: ${res.status} ${err}`);
      break;
    }

    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function getNotionTitle(page: NotionPage): string {
  // 「名前」プロパティ (title型)
  const titleProp = Object.values(page.properties).find((p: any) => p.type === "title");
  if (!titleProp) return "Untitled";
  return titleProp.title?.map((t: any) => t.plain_text).join("") || "Untitled";
}

function getNotionSelect(page: NotionPage, propName: string): string | null {
  const prop = page.properties[propName];
  if (!prop || prop.type !== "select") return null;
  return prop.select?.name || null;
}

function getNotionNumber(page: NotionPage, propName: string): number | null {
  const prop = page.properties[propName];
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

// 教材種類 → lesson_type マッピング
function mapLessonType(materialType: string | null): string {
  switch (materialType) {
    case "教材":
    case "教材+メンタリング":
      return "テキスト";
    case "動画講義":
      return "動画";
    case "特別メンタリング":
      return "模擬面接";
    case "限定イベント":
      return "ケース演習";
    default:
      return "テキスト";
  }
}

// ============================================
// Supabase 投入関数
// ============================================

async function ensureCourse(
  title: string,
  opts: {
    slug: string;
    category?: string;
    description?: string;
    target_attribute?: string;
    sort_order?: number;
  }
): Promise<string> {
  // 既存チェック
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", opts.slug)
    .maybeSingle();

  if (existing) {
    console.log(`  📦 Course exists: ${title} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title,
      slug: opts.slug,
      category: opts.category || null,
      description: opts.description || null,
      target_attribute: opts.target_attribute || null,
      sort_order: opts.sort_order || 0,
      is_active: true,
      status: "published",
      level: "beginner",
      total_lessons: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`  ❌ Failed to create course "${title}":`, error.message);
    throw error;
  }
  console.log(`  ✅ Created course: ${title} (${data.id})`);
  return data.id;
}

async function ensureModule(courseId: string, title: string, sortOrder: number): Promise<string> {
  const { data: existing } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId)
    .eq("title", title)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("modules")
    .insert({ course_id: courseId, title, sort_order: sortOrder })
    .select("id")
    .single();

  if (error) {
    console.error(`  ❌ Failed to create module "${title}":`, error.message);
    throw error;
  }
  return data.id;
}

async function createLesson(
  courseId: string,
  moduleId: string,
  title: string,
  lessonType: string,
  sortOrder: number,
  opts?: { video_url?: string; content_url?: string; markdown_content?: string }
): Promise<string> {
  const { data: existing } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)
    .eq("title", title)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      title,
      lesson_type: lessonType,
      sort_order: sortOrder,
      is_active: true,
      video_url: opts?.video_url || null,
      content_url: opts?.content_url || null,
      markdown_content: opts?.markdown_content || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`  ❌ Failed to create lesson "${title}":`, error.message);
    throw error;
  }
  return data.id;
}

async function setPlanAccess(courseId: string, planSlugs: string[]): Promise<void> {
  if (planSlugs.length === 0) return;  // 空 = 全プラン公開

  // plan slugs → plan ids
  const { data: plans } = await supabase
    .from("plans")
    .select("id, slug")
    .in("slug", planSlugs);

  if (!plans || plans.length === 0) return;

  // 既存削除
  await supabase
    .from("course_plan_access")
    .delete()
    .eq("course_id", courseId);

  // 挿入
  const rows = plans.map((p: any) => ({
    course_id: courseId,
    plan_id: p.id,
  }));

  const { error } = await supabase
    .from("course_plan_access")
    .insert(rows);

  if (error) {
    console.error(`  ⚠️ Failed to set plan access for course ${courseId}:`, error.message);
  }
}

async function updateCourseCount(courseId: string): Promise<void> {
  const { count } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);

  await supabase
    .from("courses")
    .update({ total_lessons: count || 0 })
    .eq("id", courseId);
}

// ============================================
// メイン実行
// ============================================

async function seedShinsotsuCurriculum() {
  console.log("\n🎓 新卒カリキュラム投入開始...\n");

  for (const [key, dbId] of Object.entries(SHINSOTSU_DBS)) {
    console.log(`\n📚 DB: ${key} (${dbId})`);

    const pages = await queryNotionDatabase(dbId);
    console.log(`  取得ページ数: ${pages.length}`);

    if (pages.length === 0) continue;

    // コースslug
    const courseSlug = `shinsotsu-curriculum-${key.replace(/_/g, "-")}`;
    const courseName = key === "standard_light"
      ? "新卒カリキュラム（スタンダード/ライト）"
      : key === "minimum"
      ? "新卒カリキュラム（ミニマム）"
      : "新卒カリキュラム（選コミュ）";

    // プラン紐付け
    const planSlugs = key === "standard_light"
      ? ["shinsotsu_standard", "shinsotsu_light"]
      : key === "minimum"
      ? ["shinsotsu_minimum"]
      : ["shinsotsu_senkomu"];

    const courseId = await ensureCourse(courseName, {
      slug: courseSlug,
      category: "カリキュラム",
      description: `${courseName} - ${pages.length}項目`,
      target_attribute: "新卒",
      sort_order: key === "standard_light" ? 100 : key === "minimum" ? 101 : 102,
    });

    // チャプターごとにグルーピング
    const chapterMap = new Map<string, NotionPage[]>();
    for (const page of pages) {
      const chapter = getNotionSelect(page, "チャプター") || "その他";
      if (!chapterMap.has(chapter)) chapterMap.set(chapter, []);
      chapterMap.get(chapter)!.push(page);
    }

    let lessonSortOrder = 0;
    let moduleOrder = 0;

    for (const [chapterName, chapterPages] of chapterMap.entries()) {
      moduleOrder++;
      const moduleId = await ensureModule(courseId, chapterName, moduleOrder);

      // タイトルの番号でソート
      const sorted = chapterPages.sort((a, b) => {
        const titleA = getNotionTitle(a);
        const titleB = getNotionTitle(b);
        const numA = parseInt(titleA.match(/^(\d+)/)?.[1] || "999");
        const numB = parseInt(titleB.match(/^(\d+)/)?.[1] || "999");
        return numA - numB;
      });

      for (const page of sorted) {
        lessonSortOrder++;
        const title = getNotionTitle(page);
        const materialType = getNotionSelect(page, "教材種類");
        const lessonType = mapLessonType(materialType);

        await createLesson(courseId, moduleId, title, lessonType, lessonSortOrder);
      }
    }

    await updateCourseCount(courseId);
    await setPlanAccess(courseId, planSlugs);

    console.log(`  ✅ ${courseName}: ${lessonSortOrder}レッスン, ${moduleOrder}モジュール`);
  }
}

async function seedKisotsuContent() {
  console.log("\n📖 中途コンテンツ投入開始...\n");

  let sortOrder = 200;
  for (const courseDef of KISOTSU_COURSES) {
    sortOrder++;
    const slug = courseDef.title
      .replace(/[【】()（）/]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff-]/g, "")
      || `kisotsu-course-${sortOrder}`;

    const courseId = await ensureCourse(courseDef.title, {
      slug,
      category: courseDef.category,
      description: courseDef.description,
      target_attribute: "既卒",
      sort_order: sortOrder,
    });

    // 単一モジュール作成（コンテンツは後で管理画面から追加）
    const moduleId = await ensureModule(courseId, courseDef.title, 1);

    // プレースホルダーレッスン（実際のコンテンツは管理画面 or 後続スクリプトで追加）
    await createLesson(courseId, moduleId, `${courseDef.title} - コンテンツ`, "テキスト", 1);

    await updateCourseCount(courseId);
    await setPlanAccess(courseId, courseDef.target_plans);

    console.log(`  ✅ ${courseDef.title}`);
  }
}

async function main() {
  console.log("🚀 カリキュラムデータ投入スクリプト開始");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Notion Token: ${NOTION_TOKEN.slice(0, 10)}...`);

  try {
    // 新卒カリキュラム（Notion APIから取得）
    await seedShinsotsuCurriculum();

    // 中途コンテンツ（定義ベース）
    await seedKisotsuContent();

    console.log("\n🎉 全データ投入完了!");

    // 検証: カウント
    const { count: courseCount } = await supabase
      .from("courses")
      .select("id", { count: "exact", head: true });
    const { count: lessonCount } = await supabase
      .from("lessons")
      .select("id", { count: "exact", head: true });
    const { count: planCount } = await supabase
      .from("plans")
      .select("id", { count: "exact", head: true });

    console.log(`\n📊 最終カウント:`);
    console.log(`  コース: ${courseCount}`);
    console.log(`  レッスン: ${lessonCount}`);
    console.log(`  プラン: ${planCount}`);
  } catch (err) {
    console.error("\n❌ エラーが発生しました:", err);
    process.exit(1);
  }
}

main();
