import { PDFDocument, rgb } from "pdf-lib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("fontkit");

const FONT_URL = "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
let cachedFont: ArrayBuffer | null = null;

async function loadJapaneseFont(): Promise<ArrayBuffer> {
  if (cachedFont) return cachedFont;
  const res = await fetch(FONT_URL);
  cachedFont = await res.arrayBuffer();
  return cachedFont;
}

interface DocParams {
  customerName: string;
  customerAddress?: string;
  paymentDate?: string;
  startDate?: string;
  endDate?: string;
  certNumber?: string;
}

// ================================================================
// 請求書/受講料明細書
// ================================================================
export async function generateInvoicePdf(params: DocParams): Promise<Buffer> {
  const { customerName, paymentDate } = params;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await loadJapaneseFont();
  const font = await doc.embedFont(fontBytes);
  const boldFont = font; // same font, we'll use size for emphasis

  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);

  // 日付（右寄せ）
  const dateText = `支払い通知日　${paymentDate || ""}`;
  const dateW = font.widthOfTextAtSize(dateText, 10);
  page.drawText(dateText, { x: width - margin - dateW, y, size: 10, font, color: black });
  y -= 40;

  // タイトル
  const title = "請求書/受講料明細書";
  const titleW = font.widthOfTextAtSize(title, 18);
  page.drawText(title, { x: (width - titleW) / 2, y, size: 18, font, color: black });
  y -= 40;

  // 宛名
  page.drawText(`${customerName}様`, { x: margin, y, size: 12, font, color: black });
  y -= 25;
  page.drawText("補助事業者：株式会社トップティア", { x: margin, y, size: 10, font, color: black });
  y -= 20;
  page.drawText("以下のとおりご請求します。", { x: margin, y, size: 10, font, color: black });
  y -= 30;

  // テーブル
  const tableData = [
    ["講座受講料", "407,273円"],
    ["消費税", "40,727円"],
    ["合計", "448,000円"],
    ["リスキリングを通じたキャリアアップ支援事業補填金", "203,636円"],
    ["当社負担による受講料補填：20,364円", ""],
    ["差引請求額", "224,000円"],
  ];

  const colX = margin;
  const col2X = width - margin;
  for (let i = 0; i < tableData.length; i++) {
    const [label, value] = tableData[i];
    const isBold = i === 2 || i === 5;
    const sz = isBold ? 12 : 10;
    page.drawText(label, { x: colX, y, size: sz, font, color: black });
    if (value) {
      const vw = font.widthOfTextAtSize(value, sz);
      page.drawText(value, { x: col2X - vw, y, size: sz, font, color: black });
    }
    y -= 5;
    page.drawLine({ start: { x: colX, y }, end: { x: col2X, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 20;
  }

  // 注記
  y -= 10;
  const notes = [
    "※リスキリングを通じたキャリアアップ支援事業補填金は公的な国庫補助金を財源とした補填金であり、",
    "　資産の譲渡等の対価として支払うものではないことから、消費税は不課税です。",
    "",
    "※リスキリングを通じたキャリアアップ支援事業補填金は一時所得扱いです。",
    "　他の一時所得と合算して年間50万円を超える場合は確定申告が必要です。",
    "　一時所得は、所得金額の計算上、特別控除額を控除することとされており、",
    "　他の一時所得とされる所得との合計額が年間50万円を超えない限り、原則として、",
    "　本事業による補助を理由として、確定申告をする必要はありません。",
    "　また、一般的な給与所得者の方については、その給与以外の所得金額が年間20万円を",
    "　超えない場合には、確定申告をする必要がないこととされており、一時所得については、",
    "　50万円を控除した残額に2分の1を乗じた金額によって所得税額を計算することとされて",
    "　いますので、他の一時所得とされる所得との合計額が90万円を超えない限り、",
    "　確定申告をする必要はありません。",
    "",
    "※当社負担による受講料補填は、当社が独自で行っているキャンペーンに基づくものとなります。",
  ];
  for (const line of notes) {
    page.drawText(line, { x: colX, y, size: 7, font, color: gray });
    y -= 12;
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ================================================================
// 領収書
// ================================================================
export async function generateReceiptPdf(params: DocParams): Promise<Buffer> {
  const { customerName, paymentDate } = params;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await loadJapaneseFont();
  const font = await doc.embedFont(fontBytes);

  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  const black = rgb(0, 0, 0);

  // タイトル
  const title = "領 収 書";
  const titleW = font.widthOfTextAtSize(title, 22);
  page.drawText(title, { x: (width - titleW) / 2, y, size: 22, font, color: black });
  y -= 8;
  page.drawLine({ start: { x: (width - titleW) / 2, y }, end: { x: (width + titleW) / 2, y }, thickness: 2, color: black });
  y -= 40;

  // 日付（右寄せ）
  const dateText = paymentDate || "";
  const dateW = font.widthOfTextAtSize(dateText, 10);
  page.drawText(dateText, { x: width - margin - dateW, y, size: 10, font, color: black });
  y -= 35;

  // 宛名
  page.drawText(`${customerName} 様`, { x: margin, y, size: 14, font, color: black });
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 200, y }, thickness: 0.5, color: black });
  y -= 50;

  // 金額
  const amountLabel = "金額";
  const amountLW = font.widthOfTextAtSize(amountLabel, 10);
  page.drawText(amountLabel, { x: (width - amountLW) / 2, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 30;
  const amount = "¥224,000-（税込）";
  const amountW = font.widthOfTextAtSize(amount, 20);
  page.drawText(amount, { x: (width - amountW) / 2, y, size: 20, font, color: black });
  y -= 50;

  // 但し書き
  page.drawText("但し コンサルタント養成講座受講料として", { x: margin, y, size: 10, font, color: black });
  y -= 18;
  page.drawText("上記正に領収いたしました。", { x: margin, y, size: 10, font, color: black });
  y -= 60;

  // 発行者
  page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText("株式会社トップティア", { x: margin, y, size: 12, font, color: black });
  y -= 20;
  page.drawText("代表取締役 山本雄大", { x: margin, y, size: 10, font, color: black });
  y -= 18;
  page.drawText("〒150-0021 東京都渋谷区恵比寿西一丁目33番6号 JP noie 恵比寿西 1F", { x: margin, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ================================================================
// 修了証明書
// ================================================================
export async function generateCertificatePdf(params: DocParams): Promise<Buffer> {
  const { customerName, customerAddress, startDate, endDate, certNumber } = params;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await loadJapaneseFont();
  const font = await doc.embedFont(fontBytes);

  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  const black = rgb(0, 0, 0);

  // 通し番号（右寄せ）
  if (certNumber) {
    const numText = `通し番号：${certNumber}`;
    const numW = font.widthOfTextAtSize(numText, 9);
    page.drawText(numText, { x: width - margin - numW, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  }
  y -= 40;

  // タイトル
  const title = "修了証明書";
  const titleW = font.widthOfTextAtSize(title, 22);
  page.drawText(title, { x: (width - titleW) / 2, y, size: 22, font, color: black });
  y -= 50;

  // 住所
  if (customerAddress) {
    page.drawText(customerAddress, { x: margin, y, size: 11, font, color: black });
    y -= 22;
  }

  // 宛名
  page.drawText(`${customerName} 殿`, { x: margin, y, size: 14, font, color: black });
  y -= 40;

  // 本文
  const bodyLines = [
    "あなたは、経済産業省「リスキリングを通じたキャリアアップ支援事業」の",
    "補助事業を通じ、「戦略的思考力育成・コンサルタント養成講座（講座番号：1）」",
    "を修了されましたので、これを証します。",
  ];
  for (const line of bodyLines) {
    page.drawText(line, { x: margin, y, size: 11, font, color: black });
    y -= 20;
  }
  y -= 20;

  // 日付
  page.drawText(`受講開始日：${startDate || ""}`, { x: margin, y, size: 11, font, color: black });
  y -= 22;
  page.drawText(`受講修了日：${endDate || ""}`, { x: margin, y, size: 11, font, color: black });
  y -= 22;
  page.drawText("講座の受講金額（税抜）：407,273円", { x: margin, y, size: 11, font, color: black });
  y -= 50;

  // 署名（右寄せ）
  const sig1 = "株式会社トップティア";
  const sig1W = font.widthOfTextAtSize(sig1, 12);
  page.drawText(sig1, { x: width - margin - sig1W, y, size: 12, font, color: black });
  y -= 22;
  const sig2 = "代表取締役社長 山本雄大";
  const sig2W = font.widthOfTextAtSize(sig2, 11);
  page.drawText(sig2, { x: width - margin - sig2W, y, size: 11, font, color: black });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
