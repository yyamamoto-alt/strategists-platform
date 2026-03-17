import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { generateInvoicePdf, generateReceiptPdf, generateCertificatePdf } from "@/lib/pdf/generate-subsidy-pdf";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_ADDRESS = process.env.EMAIL_FROM || "ケース面接対策塾Strategists <noreply@akagiconsulting.com>";
const CC_ADDRESS = "support@akagiconsulting.com";

export async function POST(request: Request) {
  const body = await request.json();
  const { customerId, docType, customerName, customerEmail, paymentDate, startDate, endDate, sendEmail } = body;

  if (!customerId || !docType) {
    return NextResponse.json({ error: "customerId and docType are required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let certificateNumber: string | null = null;

  if (docType === "certificate") {
    const { count } = await db
      .from("subsidy_documents")
      .select("id", { count: "exact", head: true })
      .eq("doc_type", "certificate");
    const num = (count || 0) + 1;
    certificateNumber = String(num).padStart(5, "0");
  }

  // Insert document record
  const { data: doc, error: insertError } = await db
    .from("subsidy_documents")
    .insert({
      customer_id: customerId,
      doc_type: docType,
      certificate_number: certificateNumber,
      metadata: {
        customer_name: customerName,
        payment_date: paymentDate,
        start_date: startDate,
        end_date: endDate,
      },
    })
    .select("id, certificate_number, issued_at")
    .single();

  if (insertError) {
    console.error("Failed to insert subsidy document:", insertError);
    return NextResponse.json({ error: "書類の登録に失敗しました" }, { status: 500 });
  }

  // Send email with PDF attachment if requested
  let emailSentAt: string | null = null;
  if (sendEmail && customerEmail && resend) {
    try {
      const subjectMap: Record<string, string> = {
        invoice: "【Strategists】請求書/受講料明細書のご送付",
        receipt: "【Strategists】領収書のご送付",
        certificate: "【Strategists】修了証明書のご送付",
      };
      const subject = subjectMap[docType] || "【Strategists】書類のご送付";

      const htmlBodyMap: Record<string, string> = {
        invoice: generateInvoiceEmailHtml(customerName, paymentDate),
        receipt: generateReceiptEmailHtml(customerName, paymentDate),
        certificate: generateCertificateEmailHtml(customerName, certificateNumber),
      };
      const htmlBody = htmlBodyMap[docType] || "";

      // Generate PDF
      const pdfParams = { customerName, paymentDate, startDate, endDate, certNumber: certificateNumber || undefined };
      let pdfBuffer: Buffer;
      let pdfFilename: string;
      if (docType === "invoice") {
        pdfBuffer = await generateInvoicePdf(pdfParams);
        pdfFilename = `請求書_${customerName}.pdf`;
      } else if (docType === "receipt") {
        pdfBuffer = await generateReceiptPdf(pdfParams);
        pdfFilename = `領収書_${customerName}.pdf`;
      } else {
        pdfBuffer = await generateCertificatePdf(pdfParams);
        pdfFilename = `修了証明書_${customerName}.pdf`;
      }

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: customerEmail,
        cc: CC_ADDRESS,
        subject,
        html: htmlBody,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
          },
        ],
      });

      emailSentAt = new Date().toISOString();
      await db
        .from("subsidy_documents")
        .update({ email_sent_at: emailSentAt, email_to: customerEmail })
        .eq("id", doc.id);
    } catch (e) {
      console.error("Failed to send email:", e);
      return NextResponse.json({
        success: true,
        documentId: doc.id,
        certificateNumber,
        issuedAt: doc.issued_at,
        emailSentAt: null,
        emailError: "メール送信に失敗しました。書類の登録は完了しています。",
      });
    }
  }

  return NextResponse.json({
    success: true,
    documentId: doc.id,
    certificateNumber,
    issuedAt: doc.issued_at,
    emailSentAt,
  });
}

function generateInvoiceEmailHtml(customerName: string, paymentDate: string | null): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333;">
      <h2 style="color: #C13028;">請求書/受講料明細書のご送付</h2>
      <p>${customerName} 様</p>
      <p>いつもお世話になっております。<br>株式会社トップティアでございます。</p>
      <p>リスキリングを通じたキャリアアップ支援事業に関する請求書/受講料明細書をお送りいたします。<br>添付のPDFをご確認ください。</p>
      <p>ご不明点がございましたら、お気軽にお問い合わせください。</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #888;">
        株式会社トップティア<br>
        〒150-0021 東京都渋谷区恵比寿西一丁目33番6号 JP noie 恵比寿西 1F<br>
        support@akagiconsulting.com
      </p>
    </div>
  `;
}

function generateReceiptEmailHtml(customerName: string, paymentDate: string | null): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333;">
      <h2 style="color: #C13028;">領収書のご送付</h2>
      <p>${customerName} 様</p>
      <p>いつもお世話になっております。<br>株式会社トップティアでございます。</p>
      <p>コンサルタント養成講座受講料の領収書をお送りいたします。<br>添付のPDFをご確認ください。</p>
      <p>ご不明点がございましたら、お気軽にお問い合わせください。</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #888;">
        株式会社トップティア<br>
        〒150-0021 東京都渋谷区恵比寿西一丁目33番6号 JP noie 恵比寿西 1F<br>
        support@akagiconsulting.com
      </p>
    </div>
  `;
}

function generateCertificateEmailHtml(customerName: string, certNumber: string | null): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #333;">
      <h2 style="color: #C13028;">修了証明書のご送付</h2>
      <p>${customerName} 様</p>
      <p>いつもお世話になっております。<br>株式会社トップティアでございます。</p>
      <p>経済産業省「リスキリングを通じたキャリアアップ支援事業」に関する修了証明書${certNumber ? `（通し番号: ${certNumber}）` : ""}をお送りいたします。<br>添付のPDFをご確認ください。</p>
      <p>ご不明点がございましたら、お気軽にお問い合わせください。</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #888;">
        株式会社トップティア<br>
        〒150-0021 東京都渋谷区恵比寿西一丁目33番6号 JP noie 恵比寿西 1F<br>
        support@akagiconsulting.com
      </p>
    </div>
  `;
}
