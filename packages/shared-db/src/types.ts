// =====================================================
// 共通DB型定義
// CRM (Custome-DB) と LMS の両方で使用
// =====================================================

// ---------- ENUM型 ----------

export type CustomerAttribute = "既卒" | "新卒" | (string & {});

// DB migration 004 で TEXT型に変更済みのため string を許容
export type PipelineStage =
  | "問い合わせ"
  | "日程確定"
  | "面談実施"
  | "提案中"
  | "成約"
  | "入金済"
  | "失注"
  | "保留"
  | (string & {});

export type DealStatus =
  | "未対応"
  | "対応中"
  | "面談済"
  | "成約"
  | "失注"
  | "保留"
  | (string & {});

export type LearningLevel = "初級者" | "中級者" | "上級者" | (string & {});
export type BillingStatus = "未請求" | "請求済" | "入金済" | "分割中" | "滞納" | (string & {});
export type PlacementResult = "内定" | "入社済" | "活動中" | "休止" | "未開始" | (string & {});

export type LeadSource =
  | "SEO(直LP)"
  | "SEO(Blog)"
  | "X"
  | "Youtube"
  | "コンサルタイムズ"
  | "note"
  | "ココナラ"
  | "Udemy"
  | "有料note"
  | "アフィリエイト"
  | "インスタ"
  | "Google広告"
  | "FB広告"
  | "口コミ・紹介"
  | "イベント"
  | "Prism"
  | "その他";

export type CoursePlan =
  | "自社エージェント専用プラン"
  | "自社エージェント併用プラン"
  | "自社エージェント単体"
  | "その他";

export type ActivityType =
  | "面談"
  | "電話"
  | "メール"
  | "メモ"
  | "ステータス変更"
  | "その他";

export type UserRole = "admin" | "mentor" | "student";

export type ApplicationStatus = "pending" | "slack_notified" | "approved" | "invited" | "rejected";
export type AnnouncementPriority = "low" | "normal" | "high" | "urgent";

// ---------- CRM側テーブル ----------

export interface Customer {
  id: string;
  created_at: string;
  updated_at: string;
  application_date: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  attribute: CustomerAttribute;
  career_history: string | null;
  university: string | null;
  faculty: string | null;
  graduation_year: number | null;
  sns_accounts: string | null;
  reference_media: string | null;
  hobbies: string | null;
  behavioral_traits: string | null;
  other_background: string | null;
  notes: string | null;
  caution_notes: string | null;
  priority: string | null;
  target_companies: string | null;
  initial_level: string | null;
  // --- migration 004 追加フィールド (optional: DB上はNULLable, モックデータでは省略可) ---
  utm_id?: string | null;
  name_kana?: string | null;
  birth_date?: string | null;
  karte_email?: string | null;
  karte_phone?: string | null;
  target_firm_type?: string | null;
  application_reason?: string | null;
  application_reason_karte?: string | null;
  program_interest?: string | null;
  desired_schedule?: string | null;
  purchased_content?: string | null;
  parent_support?: string | null;
  transfer_intent?: string | null;
}

export interface SalesPipeline {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  stage: PipelineStage;
  deal_status: DealStatus;
  meeting_scheduled_date: string | null;
  meeting_conducted_date: string | null;
  meeting_result: string | null;
  agent_interest_at_application: boolean;
  sales_date: string | null;
  closing_date: string | null;
  payment_date: string | null;
  sales_content: string | null;
  sales_strategy: string | null;
  decision_factor: string | null;
  comparison_services: string | null;
  second_meeting_category: string | null;
  postponement_date: string | null;
  lead_time: string | null;
  ninety_day_message: string | null;
  agent_confirmation: string | null;
  route_by_sales: string | null;
  // --- migration 004 追加フィールド ---
  projected_amount?: number | null;
  probability?: number | null;
  response_date?: string | null;
  sales_person?: string | null;
  jicoo_message?: string | null;
  marketing_memo?: string | null;
  sales_route?: string | null;
  first_reward_category?: string | null;
  performance_reward_category?: string | null;
  google_ads_target?: string | null;
  alternative_application?: string | null;
  status_confirmed_date?: string | null;
  status_final_date?: string | null;
  sales_form_status?: string | null;
  additional_sales_content?: string | null;
  additional_plan?: string | null;
  additional_discount_info?: string | null;
  additional_notes?: string | null;
  initial_channel?: string | null;
  customer?: Customer;
}

export interface Contract {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  plan_name: CoursePlan | string | null;
  changed_plan: string | null;
  first_amount: number | null;
  second_amount: number | null;
  confirmed_amount: number | null;
  discount: number | null;
  contract_amount: number | null;
  sales_amount: number | null;
  billing_status: BillingStatus;
  payment_date: string | null;
  payment_form_url: string | null;
  subsidy_eligible: boolean;
  subsidy_amount: number | null;
  progress_sheet_url: string | null;
  // --- migration 004 追加フィールド ---
  referral_category?: string | null;
  referral_status?: string | null;
  enrollment_status?: string | null;
  invoice_info?: string | null;
  customer?: Customer;
}

export interface AgentRecord {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  agent_service_enrolled: boolean;
  agent_plan: string | null;
  agent_memo: string | null;
  job_search_status: PlacementResult;
  selection_status: string | null;
  level_up_confirmed: string | null;
  document_pass_rate: number | null;
  exam_count: number;
  offer_company: string | null;
  placement_company: string | null;
  placement_date: string | null;
  offer_salary: number | null;
  expected_salary_rate: number | null;
  referral_fee_rate: number | null;
  margin: number | null;
  external_agents: string | null;
  loss_reason: string | null;
  loss_detail: string | null;
  // --- migration 004 追加フィールド ---
  expected_agent_revenue?: number | null;
  hire_rate?: number | null;
  offer_probability?: number | null;
  expected_referral_fee?: number | null;
  agent_staff?: string | null;
  placement_confirmed?: string | null;
  general_memo?: string | null;
  customer?: Customer;
}

export interface Activity {
  id: string;
  customer_id: string;
  created_at: string;
  activity_type: ActivityType;
  content: string;
  created_by: string | null;
}

// ---------- LMS側テーブル ----------

export interface LearningRecord {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  coaching_start_date: string | null;
  coaching_end_date: string | null;
  last_coaching_date: string | null;
  total_sessions: number;
  assessment_count: number;
  attendance_rate: number | null;
  current_level: LearningLevel | null;
  latest_evaluation: string | null;
  curriculum_progress: number | null;
  case_interview_progress: string | null;
  case_interview_weaknesses: string | null;
  // --- migration 004 追加フィールド ---
  mentor_name?: string | null;
  contract_months?: number | null;
  weekly_sessions?: number | null;
  completed_sessions?: number;
  session_completion_rate?: number | null;
  level_fermi?: string | null;
  level_case?: string | null;
  level_mck?: string | null;
  level_up_range?: string | null;
  interview_timing_at_end?: string | null;
  target_companies_at_end?: string | null;
  offer_probability_at_end?: string | null;
  additional_coaching_proposal?: string | null;
  initial_coaching_level?: string | null;
  enrollment_form_date?: string | null;
  coaching_requests?: string | null;
  enrollment_reason?: string | null;
  behavior_session1?: string | null;
  behavior_session2?: string | null;
  assessment_session1?: string | null;
  assessment_session2?: string | null;
  extension_days?: number | null;
  mentoring_satisfaction?: string | null;
  start_email_sent?: string | null;
  progress_text?: string | null;
  selection_status?: string | null;
  customer?: Customer;
}

export interface Course {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  slug?: string;
  description: string | null;
  category: string | null;
  level?: string;
  target_attribute: CustomerAttribute | null;
  total_lessons: number;
  duration_weeks?: number;
  is_active: boolean;
  sort_order: number;
  status?: string;
  instructor_id?: string;
  thumbnail_url?: string | null;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  lessons?: Lesson[];
}

export interface Lesson {
  id: string;
  course_id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  lesson_type: "動画" | "テキスト" | "ケース演習" | "模擬面接" | "課題";
  content_url: string | null;
  video_url?: string | null;
  markdown_content?: string | null;
  copy_protected?: boolean;
  duration_minutes: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface LessonProgress {
  id: string;
  customer_id: string;
  lesson_id: string;
  created_at: string;
  updated_at: string;
  status: "未着手" | "進行中" | "完了";
  started_at: string | null;
  completed_at: string | null;
  score: number | null;
  feedback: string | null;
}

export interface CoachingSession {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  scheduled_at: string;
  conducted_at: string | null;
  duration_minutes: number | null;
  mentor_name: string | null;
  session_type: "ケース面接" | "ビヘイビア面接" | "書類添削" | "キャリア相談" | "その他";
  status: "予定" | "完了" | "キャンセル" | "欠席";
  mentor_notes: string | null;
  student_notes: string | null;
  recording_url: string | null;
}

export interface Assignment {
  id: string;
  customer_id: string;
  lesson_id: string | null;
  created_at: string;
  updated_at: string;
  title: string;
  submitted_at: string | null;
  submission_url: string | null;
  status: "未提出" | "提出済" | "レビュー中" | "フィードバック済";
  score: number | null;
  reviewer_name: string | null;
  feedback: string | null;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  enrolled_at: string;
  deadline: string | null;
  schedule_status?: string;
}

export interface EnrollmentApplication {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  motivation: string | null;
  experience: string | null;
  course_id: string | null;
  course?: string;
  status: ApplicationStatus;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string | null;
}

export interface ProgressSheet {
  id: string;
  student_id: string;
  mentor_id: string;
  session_date: string;
  session_number: number;
  understanding: number;
  effort: number;
  progress: number;
  communication: number;
  overall_rating: number;
  feedback: string | null;
  strengths: string | null;
  improvements: string | null;
  next_goals: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  published_at: string | null;
  author_id: string | null;
}

// ---------- 決済・振込テーブル (migration 004) ----------

export interface Payment {
  id: string;
  created_at: string;
  plan_name: string | null;
  payment_type: string | null;
  email: string | null;
  customer_name: string | null;
  purchase_date: string | null;
  status: string | null;
  amount: number | null;
  next_billing_date: string | null;
  memo: string | null;
  installment_amount: number | null;
  installment_count: number | null;
  period: string | null;
  customer_id: string | null;
}

export interface BankTransfer {
  id: string;
  created_at: string;
  transfer_date: string | null;
  period: string | null;
  buyer_name: string | null;
  product: string | null;
  amount: number | null;
  list_price: number | null;
  discounted_price: number | null;
  genre: string | null;
  email: string | null;
  status: string | null;
  customer_id: string | null;
}

// ---------- CRM 結合型 ----------

export interface CustomerWithRelations extends Customer {
  pipeline?: SalesPipeline;
  contract?: Contract;
  learning?: LearningRecord;
  agent?: AgentRecord;
}

// ---------- ダッシュボード集計型 ----------

export interface FunnelMetrics {
  period: string;
  applications: number;
  scheduled: number;
  conducted: number;
  closed: number;
  scheduling_rate: number;
  conduct_rate: number;
  closing_rate: number;
}

export interface RevenueMetrics {
  period: string;
  confirmed_revenue: number;
  projected_revenue: number;
  school_revenue: number;
  agent_revenue: number;
  content_revenue: number;
  other_revenue: number;
}

export interface ChannelMetrics {
  channel: LeadSource;
  applications: number;
  closings: number;
  revenue: number;
  cpa: number;
  ltv: number;
}

// ---------- Phase 2: 3段階売上 & エージェント売上 ----------

/** 月別3段階売上メトリクス（Excelの PL シート再現） */
export interface ThreeTierRevenue {
  period: string;
  // Tier 1: 確定売上（入金済 + エージェント確定分）
  confirmed_school: number;
  confirmed_agent: number;
  confirmed_subsidy: number;
  confirmed_total: number;
  // Tier 2: 見込み含む売上（確定 + 受講中エージェント見込み）
  projected_agent: number;
  projected_total: number;
  // Tier 3: 予測売上（パイプライン成約率ベース）
  forecast_total: number;
}

/** エージェント売上サマリー */
export interface AgentRevenueSummary {
  total_expected_fee: number;
  total_confirmed_fee: number;
  total_projected_fee: number;
  active_agent_count: number;
  confirmed_count: number;
  in_progress_count: number;
  avg_expected_salary: number;
  avg_referral_fee_rate: number;
}

/** 四半期予測 */
export interface QuarterlyForecast {
  quarter: string;
  confirmed_revenue: number;
  projected_revenue: number;
  forecast_revenue: number;
  school_revenue: number;
  agent_revenue: number;
  closings: number;
  applications: number;
}

// ---------- フィルタ・共通型 ----------

export interface CustomerFilters {
  search?: string;
  attribute?: CustomerAttribute;
  stage?: PipelineStage;
  deal_status?: DealStatus;
  lead_source?: LeadSource;
  date_from?: string;
  date_to?: string;
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

// ---------- Supabase Database型 ----------

export interface Database {
  public: {
    Tables: {
      customers: { Row: Customer; Insert: Partial<Customer> & { name: string }; Update: Partial<Customer> };
      sales_pipeline: { Row: SalesPipeline; Insert: Partial<SalesPipeline> & { customer_id: string }; Update: Partial<SalesPipeline> };
      contracts: { Row: Contract; Insert: Partial<Contract> & { customer_id: string }; Update: Partial<Contract> };
      learning_records: { Row: LearningRecord; Insert: Partial<LearningRecord> & { customer_id: string }; Update: Partial<LearningRecord> };
      agent_records: { Row: AgentRecord; Insert: Partial<AgentRecord> & { customer_id: string }; Update: Partial<AgentRecord> };
      activities: { Row: Activity; Insert: Partial<Activity> & { customer_id: string; content: string; activity_type: ActivityType }; Update: Partial<Activity> };
      courses: { Row: Course; Insert: Partial<Course> & { title: string }; Update: Partial<Course> };
      lessons: { Row: Lesson; Insert: Partial<Lesson> & { course_id: string; title: string }; Update: Partial<Lesson> };
      lesson_progress: { Row: LessonProgress; Insert: Partial<LessonProgress> & { customer_id: string; lesson_id: string }; Update: Partial<LessonProgress> };
      coaching_sessions: { Row: CoachingSession; Insert: Partial<CoachingSession> & { customer_id: string; scheduled_at: string }; Update: Partial<CoachingSession> };
      assignments: { Row: Assignment; Insert: Partial<Assignment> & { customer_id: string; title: string }; Update: Partial<Assignment> };
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> };
      bank_transfers: { Row: BankTransfer; Insert: Partial<BankTransfer>; Update: Partial<BankTransfer> };
      user_roles: { Row: { id: string; user_id: string; customer_id: string | null; role: UserRole; created_at: string }; Insert: { user_id: string; role: UserRole; customer_id?: string }; Update: Partial<{ role: UserRole; customer_id: string | null }> };
    };
  };
}
