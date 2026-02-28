-- =============================================
-- スプレッドシートからの移行データ
-- 生成日時: 2026-02-28T01:45:03.695144
-- =============================================

BEGIN;

-- === customers (10 records) ===
INSERT INTO customers (id, application_date, name, email, phone, attribute, initial_channel, target_firm_type) VALUES ('9f670726-1f6f-4453-ac4e-44d63d6ab0a5', '2026-02-28', 'test', 'y.yamamoto@akagiconsulting.com', '9050505055', '新卒', '不明', '総合');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, utm_id, utm_campaign, attribute, initial_channel, target_firm_type) VALUES ('318fbb43-b599-4b4c-ab2a-06f9d5eb0747', '2026-02-26', '吉武佑汰', 'yyoshi86211@gmail.com', '8013399073', 'fbad', 'creative2', '120239938764410455', '120239938764410455', '既卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, utm_id, utm_campaign, attribute, initial_channel, target_firm_type) VALUES ('8927c813-70c9-442e-b9a0-9d8bc13d860f', '2026-02-26', '本条拓海', 'taku9050@gmail.com', '8087314600', 'fbad', 'creative2', '120239938764410455', '120239938764410455', '新卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, utm_id, attribute, initial_channel, target_firm_type) VALUES ('efa0e418-5afe-4f25-a626-164e9a90e126', '2026-02-26', '大城志龍', 'shiryu0046@gmail.com', '44 07494191309', 'blog', 'fotter', '【新卒向け-内定者が解説】ローランドベルガーroland-be', '新卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, attribute, initial_channel, target_firm_type) VALUES ('91163432-1145-4100-a23b-1b5f712ee0ba', '2026-02-26', '時任航平', 'lambhart322414@gmail.com', '7043051048', 'x', 'profile', '新卒', '不明', '総合');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, utm_id, utm_campaign, attribute, initial_channel, target_firm_type) VALUES ('da5e565f-100d-4d2f-a23e-bb072afc187e', '2026-02-25', '古賀雅人', 'masato.koga123@gmail.com', '8055407531', 'fbad', 'creative2', '120240119107210455', '120240119107210455', '新卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, attribute, initial_channel, target_firm_type) VALUES ('945944b3-ec7f-4b77-a770-dc0c34b35454', '2026-02-25', '山本 雄大', 'Y.yamamoto@akagiconsulting.com', '090-0000-0000', '既卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, attribute, career_history, initial_channel, karte_email, birth_date, name_kana, target_companies, target_firm_type, initial_level, program_interest, sns_accounts, reference_media, hobbies, transfer_intent) VALUES ('4cb4dd2c-fd21-4ac6-8c3c-89d8826d43ce', '2026-02-25', '新川　瑠都', 'ryu10.ryu10@gmail.com', '9027695937', 'prtimes', 'release', '既卒', '慶應義塾湘南藤沢高等部卒業
慶應義塾大学商学部卒業
新卒ベイカレント、システム構築PJを経験
グロービングに転職、経営企画として2年（コンサルではなく）', 'Google検索', 'ryu10.ryu10@gmail.com', '1997-08-14', 'シンカワ　リュウト', 'BCG, ベイン, カーニー, S&, ADL, ローランドベルガー, その他戦略コンサル', '戦略', '初心者：対策を始めたばかりでほぼ初心者', '関心が高い(他サービスと比較中)', 'https://x.com/', 'ケース面接侍田中', 'サッカー、筋トレ、サウナ', '外資戦略ファームに内定すれば転職したい（それ以外はしない）');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, attribute, initial_channel, target_firm_type) VALUES ('778f11d0-9aa1-4b4a-9bc4-177f5bee52f7', '2026-02-23', '安東侑馬', 'yuma.an1031@gmail.com', '8031552596', 'x', 'profile', '新卒', '不明', '戦略');
INSERT INTO customers (id, application_date, name, email, phone, utm_source, utm_medium, utm_id, attribute, career_history, initial_channel, karte_email, birth_date, name_kana, target_companies, target_firm_type, initial_level, program_interest, sns_accounts, reference_media, hobbies, behavioral_traits, transfer_intent) VALUES ('bc5f113f-1bc7-4cfb-925b-a2e047c15aa1', '2026-02-23', '小嶋朗正', 'rosei.820.kjm@gmail.com', '8067229057', 'googleads', '{adgroupname}_戦コン 面接', '{searchterm}', '既卒', '2023年3月一橋大学 社会学部 社会学科 卒業
2023年4月KDDI株式会社入社、6月よりビジネスデザイン本部金融営業部に配属。

・入社以来、金融機関向けの直販法人営業担当として、閉域ネットワークや音声サービス、運用、セキュリティ、AIを中心とした営業活動に従事。
・3年目である今期は、某メガバンク、某メガバンクグループ大手証券会社を主担当。
・加えてKDDIと某メガバンクとのAI協業を営業主担当として主導。両社協業方針の模索、AI協業案件の創出や、案件のデリバリー、トップリレーションの構築や、社内関連部門やグループ会社のまとめ上げなど、横断的にプロジェクトをリードしている。', 'Google検索', 'rosei.820.kjm@gmail.com', '1999-08-20', 'コジマ　ロウセイ', 'マッキンゼー, BCG, ベイン, カーニー, S&, ADL, ローランドベルガー, その他戦略コンサル', '戦略', '初心者：対策を始めたばかりでほぼ初心者', '関心が高い', 'https://x.com/', '各社エージェントのメディア記事など', '趣味：野球観戦、ツーリング
特技：大学時代に社会調査/計量社会学を学び社会調査士資格を取得。卒論でもRを使って調査データの定量分析をしていました。', '知識や経験には自信がないが、思考力や思考スピードには比較的自信がある, チームをまとめたりリーダーシップを取るのが得意である/好きである', 'ブティック系も含めた戦略ファームに内定すれば転職したい');

-- === sales_pipeline (10 records) ===
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, initial_channel, id) VALUES ('9f670726-1f6f-4453-ac4e-44d63d6ab0a5', '日程未確', 0, '不明', '未実施', '不明', 'fcbcb66a-cf56-4f88-b262-e4fc82d741b3');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, sales_date, sales_person, initial_channel, id) VALUES ('318fbb43-b599-4b4c-ab2a-06f9d5eb0747', '未実施', 0, '不明', '未実施', '2026-03-01', '東山', '不明', '4f830450-5d7a-4f61-a59f-470ddaf24d14');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, initial_channel, id) VALUES ('8927c813-70c9-442e-b9a0-9d8bc13d860f', '日程未確', 0, '不明', '未実施', '不明', '77511cb9-be5e-4b78-a32d-07e4e90e4bb9');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, sales_date, sales_person, initial_channel, id) VALUES ('efa0e418-5afe-4f25-a626-164e9a90e126', '未実施', 0, '不明', '未実施', '2026-03-01', '東山', '不明', '4d2f743d-834c-463d-ad24-e746eca51614');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, initial_channel, id) VALUES ('91163432-1145-4100-a23b-1b5f712ee0ba', '日程未確', 0, '不明', '未実施', '不明', 'f9b62932-9915-4844-9fb6-3b7bcc86c423');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, initial_channel, id) VALUES ('da5e565f-100d-4d2f-a23e-bb072afc187e', '日程未確', 0, '不明', '未実施', '不明', '452ef5cd-fb9e-4031-ab56-d5267de6bb28');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, sales_date, sales_person, initial_channel, alternative_application, id) VALUES ('945944b3-ec7f-4b77-a770-dc0c34b35454', '成約', 243000, '不明', '実施', '2026-02-26', 'Tanaka Tanaka', '不明', '自己応募や他社経由でエントリーするファーム', 'bc95d01d-8c1e-4517-8825-4ab1b4824429');
INSERT INTO sales_pipeline (customer_id, agent_interest_at_application, meeting_scheduled_date, stage, projected_amount, decision_factor, deal_status, sales_content, sales_date, probability, response_date, sales_person, sales_strategy, agent_confirmation, sales_route, comparison_services, initial_channel, id) VALUES ('4cb4dd2c-fd21-4ac6-8c3c-89d8826d43ce', 'フォルトナ', '4月（未定）', '追加指導', 0, 'サービス説明ページを読んで', '実施', '・28歳新卒べいかれ4年、シニアコンサルまで昇進。その後グロービングで経営企画へ（エージェント事業の構造めっちゃ詳しいので注意）
・エージェントはフォルトナに話を聞き始めたが、まだ出したりはしていない
・KPMGFAS,S&、ADL、AC戦略あたりまでは転職する、MBBもちろん第一（MとBCGは書類出せないことは伝達済み）
・ケースはかなり筋よいのであえて厳しめフィードバックしてさせている。エージェントとしてもかなりぶっちゃけた話をした（別にここで儲けるつもりはないけど喜んでもらっているっていういつものトーク）ので納得いただけた
・基本うちで始めたいし急いでいるが、さすがに他社も1社くらい話を聞いて比較したうえで選びたいとのこと。ただ、具体的にどこか考えているわけではなく、これから1社どこか探すって感じ。Boot Campは知っているが１００マンはさすがに高いですね～と笑っていた
・追加指導は3/9に念のため抑えているが、それまでに決めた場合は連絡していいか聞かれたのでもちろんOKと伝えている
・確度高いが万が一誰かに変なこと吹きこまれたときは追加指導で挽回する
・エージェントとしてちゃんと信頼してもらえるかがLTV的にはカギ', '2026-02-27', 0.6, '2026-02-09', '田中', 'LINE返信すぐすることを気に掛ける。', '検討が難しいが、念の為話を聞きたい', 'Web検索', 'これから１社探して検討', 'Google検索', '50778e2a-2451-448b-be5c-bb03add6298c');
INSERT INTO sales_pipeline (customer_id, stage, projected_amount, decision_factor, deal_status, sales_content, sales_date, probability, response_date, sales_person, sales_strategy, initial_channel, id) VALUES ('778f11d0-9aa1-4b4a-9bc4-177f5bee52f7', 'CL', 0, '不明', '実施', 'キャンセル', '2026-02-25', 0.0, '2026-02-25', '岡本', 'キャンセル', '不明', '86d2b665-ae6b-4bbe-b61e-fe39dbe173b2');
INSERT INTO sales_pipeline (customer_id, agent_interest_at_application, meeting_scheduled_date, stage, projected_amount, decision_factor, deal_status, sales_date, sales_person, agent_confirmation, initial_channel, id) VALUES ('bc5f113f-1bc7-4cfb-925b-a2e047c15aa1', 'wayout strategic partners', '2026年6月～7月', '未実施', 0, 'サービス説明ページを読んで', '未実施', '2026-03-09', 'Tanaka Tanaka', '検討できない', 'Google検索', 'c675d465-f2b4-44e8-a13c-68790bac5ac6');

-- === contracts (10 records) ===
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('9f670726-1f6f-4453-ac4e-44d63d6ab0a5', 0, '一次報酬（testさまの受講料0円の25%）', '未請求', 0, '2cf3a6d5-708f-413c-bc8a-52651c83199b');
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('318fbb43-b599-4b4c-ab2a-06f9d5eb0747', 0, '一次報酬（吉武佑汰さまの受講料0円の25%）', '未請求', 0, '0f201278-ec5d-4eec-9092-b5c4b5e253f6');
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('8927c813-70c9-442e-b9a0-9d8bc13d860f', 0, '一次報酬（本条拓海さまの受講料0円の25%）', '未請求', 0, '7266506d-0c44-4956-89fb-e85d0f84d65c');
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('efa0e418-5afe-4f25-a626-164e9a90e126', 0, '一次報酬（大城志龍さまの受講料0円の25%）', '未請求', 0, '24aebec9-b8e6-421c-82ac-02a15cdc3553');
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('91163432-1145-4100-a23b-1b5f712ee0ba', 0, '一次報酬（時任航平さまの受講料0円の25%）', '未請求', 0, '53b2e82d-afb1-44d2-a71b-b4bbc1450021');
INSERT INTO contracts (customer_id, confirmed_amount, invoice_info, billing_status, subsidy_amount, id) VALUES ('da5e565f-100d-4d2f-a23e-bb072afc187e', 0, '一次報酬（古賀雅人さまの受講料0円の25%）', '未請求', 0, '1299298d-a462-437e-bcbf-964033e5f66b');
INSERT INTO contracts (customer_id, referral_category, confirmed_amount, enrollment_status, plan_name, invoice_info, billing_status, subsidy_amount, id) VALUES ('945944b3-ec7f-4b77-a770-dc0c34b35454', 'フル利用', 0, '受講中', '既卒/長期', '一次報酬（山本 雄大さまの受講料0円の25%）', '未請求', 0, '333d882e-8b37-4978-8dd7-2c8ec1fc23cc');
INSERT INTO contracts (customer_id, referral_category, confirmed_amount, discount, progress_sheet_url, plan_name, invoice_info, billing_status, subsidy_amount, id) VALUES ('4cb4dd2c-fd21-4ac6-8c3c-89d8826d43ce', '自社', 0, 0, 'https://docs.google.com/spreadsheets/d/1Nfg1baZvSXExl8jgGbBZfXnKnZnXNl3uc67wXb6eiYs/edit', '既卒/通常', '一次報酬（新川　瑠都さまの受講料0円の25%）', '未請求', 0, '210bccae-b77b-4d0b-aeec-961c822b2e5a');
INSERT INTO contracts (customer_id, referral_category, confirmed_amount, discount, plan_name, invoice_info, billing_status, subsidy_amount, id) VALUES ('778f11d0-9aa1-4b4a-9bc4-177f5bee52f7', 'なし', 0, 0, 'キャンセル', '一次報酬（安東侑馬さまの受講料0円の25%）', '未請求', 0, '6b2589eb-7e67-4554-bc64-7ed54c4f4294');
INSERT INTO contracts (customer_id, confirmed_amount, progress_sheet_url, invoice_info, billing_status, subsidy_amount, id) VALUES ('bc5f113f-1bc7-4cfb-925b-a2e047c15aa1', 0, 'https://docs.google.com/spreadsheets/d/1o5IbKr3VlpRKoT-GEUa9rDAtUZwAeqFkMQzBmk_bBjE/edit', '一次報酬（安東侑馬さまの受講料0円の25%）', '未請求', 0, '242d33f5-56dd-4314-9217-61cf5237a42e');

-- === learning_records (10 records) ===
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('9f670726-1f6f-4453-ac4e-44d63d6ab0a5', 0, 'c3d72a85-c7b7-43b2-bafb-4cb447bcd65b');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('318fbb43-b599-4b4c-ab2a-06f9d5eb0747', 0, '0b5eb9cf-d83b-435b-be3e-d266aad3bfba');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('8927c813-70c9-442e-b9a0-9d8bc13d860f', 0, 'f7489596-16a1-4f9e-b35b-bdfac3ecb262');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('efa0e418-5afe-4f25-a626-164e9a90e126', 0, 'a27e2fdc-a0dc-4bd1-909c-59cd7b911467');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('91163432-1145-4100-a23b-1b5f712ee0ba', 0, 'bae5a5e1-4ae5-4253-897e-bda038b23ea3');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('da5e565f-100d-4d2f-a23e-bb072afc187e', 0, 'd8c8ff65-b859-4daf-9be0-595609204d73');
INSERT INTO learning_records (customer_id, contract_months, total_sessions, weekly_sessions, completed_sessions, session_completion_rate, enrollment_form_date, coaching_requests, enrollment_reason, id) VALUES ('945944b3-ec7f-4b77-a770-dc0c34b35454', 4, 16, 0.9333333333, 0, 0.0, '2026-02-26', '（任意）指導にあたっての要望、重点的にFBして欲しい点や、成長したいと考えているポイントなど', 'Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由
*', '671737fc-133f-4ce6-9292-8b303bd88e51');
INSERT INTO learning_records (customer_id, completed_sessions, case_interview_progress, case_interview_weaknesses, id) VALUES ('4cb4dd2c-fd21-4ac6-8c3c-89d8826d43ce', 0, '■書籍
・BCG高松さんのフェルミ推定の技術
・東大生が書いたシリーズ
■壁打ち
転職エージェントに数回', '■フェルミ推定
・計算スピード
・制限時間を踏まえた分解の粒度
■ケース
・思いつきではない打ち手の検討
・ビジネスセンス', '8fe06691-1cf5-488d-b5ac-44e3c66b4f7a');
INSERT INTO learning_records (customer_id, completed_sessions, id) VALUES ('778f11d0-9aa1-4b4a-9bc4-177f5bee52f7', 0, 'c2ae2d60-c3f9-4554-bb25-5505578c0b25');
INSERT INTO learning_records (customer_id, completed_sessions, case_interview_progress, case_interview_weaknesses, id) VALUES ('bc5f113f-1bc7-4cfb-925b-a2e047c15aa1', 0, '・先週よりエージェント経由で順次インプットを実施。
・読んだ書籍：グロービスMBAマネジメントブック、考える技術・書く技術、フェルミ推定の技術', '面談当日までに一定のインプットをする予定ですが、ケース面接のお作法・流れ含め基礎的なところから身に付けていかなければならないと思っております。', '0e1aadf8-2d48-426f-96ba-6e2cc94fec04');

-- === agent_records (10 records) ===
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('9f670726-1f6f-4453-ac4e-44d63d6ab0a5', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, 'a4a2ee57-17df-4075-b673-04a923d668c8');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('318fbb43-b599-4b4c-ab2a-06f9d5eb0747', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, 'ebbb377c-240a-41b5-9826-0630b3f3a5df');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('8927c813-70c9-442e-b9a0-9d8bc13d860f', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, 'a0d79881-a14f-49c6-a7f5-9062bdcb0cb0');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('efa0e418-5afe-4f25-a626-164e9a90e126', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, '5228c1b7-b841-413d-9cff-e1fb26910370');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('91163432-1145-4100-a23b-1b5f712ee0ba', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, '280cb9ef-c94a-4049-a2fd-3ea894ffb97d');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('da5e565f-100d-4d2f-a23e-bb072afc187e', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, '27d189c8-a1db-4060-99fc-ec9f62793bac');
INSERT INTO agent_records (customer_id, agent_memo, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('945944b3-ec7f-4b77-a770-dc0c34b35454', '既卒/長期/2025年10-11月末：Strategistsプログラム受講
2025年12月：練習企業（総合ファームなど）を受験
2025年1月上旬：ブティックファームを受験
2025年1月下旬：戦略コンサルを受験
、6000000　→6000000、　(他社経由:自己応募や他社経由でエントリーするファーム)', 243000, 0.6, 0.3, 6000000, 0.3, 0, 243000, '6e50befd-a050-4673-8850-4f127d5690fc');
INSERT INTO agent_records (customer_id, expected_agent_revenue, external_agents, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, placement_date, loss_reason, expected_referral_fee, id) VALUES ('4cb4dd2c-fd21-4ac6-8c3c-89d8826d43ce', 0, 'フォルトナ', 0.6, 0.3, 8000000, 0.3, 0, '2026-07-01', '超エージェントとして取りたいので、ケースで信頼を勝ち得ながらうちから出してもらう方向で付き合っていく', 324000, '9756655e-ba55-4b07-9002-cca37b3c95bb');
INSERT INTO agent_records (customer_id, expected_agent_revenue, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, expected_referral_fee, id) VALUES ('778f11d0-9aa1-4b4a-9bc4-177f5bee52f7', 0, 0.6, 0.3, 8000000, 0.3, 0, 324000, 'f6714a62-a780-4642-8143-19f223ac3d34');
INSERT INTO agent_records (customer_id, expected_agent_revenue, external_agents, hire_rate, offer_probability, offer_salary, referral_fee_rate, margin, placement_date, expected_referral_fee, id) VALUES ('bc5f113f-1bc7-4cfb-925b-a2e047c15aa1', 0, 'wayout strategic partners', 0.6, 0.3, 8000000, 0.3, 0, '2026-10-01', 324000, '18e82656-c04f-44b7-a653-0191748920f4');

-- === payments (10 records) ===
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, amount, next_billing_date) VALUES ('cf3aa226-462e-490a-92f6-852d161e9950', 'stripe経由決済', 'スクール', 'hirotakahiro150@gmail.com', 'HIROTAKA HOJO', '2026-02-26', 224000, 'stripe');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, status, amount, installment_amount, installment_count, period) VALUES ('f30b582c-2e17-4a00-a187-635bbb1219cb', '28卒選コミュプラン_3回払い_即決5,000円引き', 'スクール', 'nagaireds@gmail.com', '永井優樹', '2026-02-23', '分割反映前', 54400, 18140, 3, '2026/02');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, amount, next_billing_date) VALUES ('ad17c060-10cb-48bc-a75f-8e2c71dbf7e2', 'stripe経由決済', 'スクール', 'satoshinolizard@outlook.jp', 'SHUN TADOKORO', '2026-02-18', 224000, 'stripe');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, status, amount, installment_amount, installment_count, period) VALUES ('3571fc62-8711-4f51-b4bd-42104011d884', '28卒スタンダードプラン_6回払い', 'スクール', 'hideya.kuwahara@gmail.com', '桑原英也', '2026-02-18', '分割反映前', 324000, 54000, 6, '2026/02');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, amount, next_billing_date) VALUES ('e5622f78-2b4f-4ece-a4d0-cc3ebe49e1db', 'stripe経由決済', 'スクール', 'shuntakara1991@gmail.com', '旬 高良', '2026-02-14', 10000, 'stripe');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, amount, next_billing_date) VALUES ('e7cf6ac9-f655-4001-9fa4-f78e6f3cd23f', 'stripe経由決済', 'スクール', 'yklps3@gmail.com', 'YUTO KIMURA', '2026-02-13', 224000, 'stripe');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, amount, next_billing_date) VALUES ('1eebb4c4-7edf-437c-a2e8-2a0eb3ce028f', 'stripe経由決済', 'スクール', 'no.1013kota@gmail.com', 'Kota Matsumoto', '2026-02-12', 224000, 'stripe');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, status, amount, period) VALUES ('0fa60f6b-5e06-4227-bfee-91f0e4f5d243', '【新卒の方】特急プラン', 'スクール', 'kimjunyeop0308@gmail.com', 'キム　ジュンヨプ', '2026-02-12', '分割反映前', 42000, '2026/02');
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, status, amount) VALUES ('508b3d25-9f69-4677-b620-6c6b586c5607', '【新卒の方】特急プラン', 'スクール', 'kimjunyeop0308@gmail.com', 'キム　ジュンヨプ', '2026-03-12', '分割反映前', 42000);
INSERT INTO payments (id, plan_name, payment_type, email, customer_name, purchase_date, status, amount) VALUES ('eafac4ad-dd3c-4e59-a60f-340361e7efd2', '【新卒の方】特急プラン', 'スクール', 'kimjunyeop0308@gmail.com', 'キム　ジュンヨプ', '2026-04-12', '分割反映前', 42000);

-- === bank_transfers (10 records) ===
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, status) VALUES ('506d59e7-119b-4fb3-819d-d88ce7c73a95', '2026-02-26', '2026-02-01', '振込  フクトミ　アヤカ', '不明', 4000, 4000, 4000, 'スクール', 'メアド入力前');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, status) VALUES ('8a0dbb12-f5e5-4338-af5b-cc67038cdb3d', '2026-02-17', '2026-02-01', '振込  ト．トゼイカンプカンリカ', '不明', 46700, 46700, 46700, 'スクール', 'メアド入力前');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('8b1db28f-aada-4ca0-8d70-2763bbd73490', '2026-02-10', '2026-02-01', '振込  ヤスダ　ダイゾウ', '不明', 296000, 296000, 296000, 'スクール', 'd11280126126@gmail.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('aff6b717-833d-420c-b7df-a5ddb7024ec8', '2026-02-06', '2026-02-01', '振込  ノウミ　タツヤ', '不明', 298000, 298000, 298000, 'スクール', 'nomi.3374@keio.jp');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('c138a4f9-df11-4e9b-9473-623cfced7ebf', '2025-12-15', '2025-12-01', '振込  キンジヨウ　アカリ', '不明', 100200, 100200, 100200, 'スクール', 'k.akari.h8.4.8@gmail.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('444e8629-e6a5-42b1-a79e-f7f3ca9999e4', '2025-12-06', '2025-12-01', '振込  マツバラ　タカノブ', '不明', 356200, 356200, 356200, 'スクール', 'n65.takanobu.matsubara@gmail.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('1f6948ef-e4fd-4f5e-913e-a314bf6f1c19', '2025-12-04', '2025-12-01', '振込  チバ　シヨウタ', '不明', 79800, 79800, 79800, 'スクール', 'shota.chiba16@gmail.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('49adc05a-5fb3-4cba-b6ac-410310ad6f88', '2025-10-25', '2025-10-01', '振込  サカキバラ　トシハル', '不明', 297000, 297000, 297000, 'スクール', 'toshiharusakakibara@outlook.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('fdfee894-ba56-4716-b5b3-fc69dda5f288', '2025-10-20', '2025-10-01', '振込  タカマツ　キヨウスケ', '不明', 277200, 277200, 277200, 'スクール', 'ktakamatsu.english@gmail.com');
INSERT INTO bank_transfers (id, transfer_date, period, buyer_name, product, amount, list_price, discounted_price, genre, email) VALUES ('f5b5b042-d376-41b4-8cbd-a743004131c0', '2025-09-16', '2025-09-01', '振込  シユ　ウイリアム', '不明', 138000, 138000, 138000, 'スクール', 'syukau20021208@163.com');

COMMIT;
