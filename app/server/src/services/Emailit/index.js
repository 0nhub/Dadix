const sendEmail = async ({ recipent, subject, html }) => {
  if (!recipent || !subject || !html) return false;
  const url = "https://api.emailit.com/v1/emails";
  const apiKey = process.env["EMAILIT_KEY"];

  const emailData = {
    from: `Dadix <noreply@${process.env.MAIL_DOMAIN}>`,
    reply_to: `noreply@${process.env.MAIL_DOMAIN}`,
    to: recipent,
    subject: subject,
    html: html,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(emailData),
    });

    const result = await response.json();
    if (
      result?.error ||
      (result?.message === "Invalid API Key")
    ) {
      throw new Error(result.message);
    }
    console.info("Email sent successfully:", result);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

const emailitService = { sendEmail };

module.exports = emailitService;
