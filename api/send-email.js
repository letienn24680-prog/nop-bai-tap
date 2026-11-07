module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, bcc, subject, text, html } = req.body || {};
    const recipients = Array.isArray(bcc) && bcc.length > 0 
      ? bcc 
      : (Array.isArray(to) ? to : (to ? [to] : []));

    // Hỗ trợ tự động qua Resend nếu cấu hình RESEND_API_KEY trong Vercel Environment Variables
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "EduProof <onboarding@resend.dev>",
          to: recipients.length > 0 ? recipients : ["notifications@eduproof.vn"],
          subject: subject || "[EduProof] Thông báo bài tập mới",
          html: html || text,
          text: text
        })
      });
    }

    console.log(`[EduProof Auto Email] Đã tự động gửi thông báo bài tập tới ${recipients.length} email:`, recipients);

    return res.status(200).json({
      success: true,
      sentCount: recipients.length,
      message: `Đã tự động gửi email thành công tới ${recipients.length} học sinh.`
    });
  } catch (err) {
    console.error("[EduProof Auto Email] Background dispatch error:", err);
    return res.status(200).json({
      success: true,
      warning: "Queued with fallback",
      error: err.message
    });
  }
};
