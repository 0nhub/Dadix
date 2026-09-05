const emailsBodyTemplates = {
  projectInvite: ({ token, role }) =>
    `
    <p>You have been invited as <b>${role}</b> into a project on <a href="https://dadix.net" style="display: inline-block;line-height: 1.2;color: inherit;text-decoration: none;box-shadow: none;">dadix.net</a> </p>
    <div style="text-align: center;padding: 20px 0;">
      <a href="${process.env.FRONTEND_ORIGIN}/invite/{{TOKEN}}" style="display: inline-block;color: #fff;background-color: #222;padding: 12px 18px;border-radius: 8px;text-decoration: none;border: none;outline: none;">Check invitation</a>
    </div>
  `.replaceAll("{{TOKEN}}", token),
};

const emailTemplate = ({ templateBody }) => {
  return `
    <div style="position: relative;width: 100%;width: calc(100% - 10px);max-width: 600px;margin: 0 auto;min-height: 100%;min-height: 100vh;display: block;font-family: sans-serif;font-size: 16px;">
    <header style="width: 100%;min-height: 50px;padding: 20px 0; text-align: center;">
      <img src="https://dadix.net/favicon.ico" width="70px" />
    </header>
    <main style="width: 100%;min-height: 100px;margin: auto;">
      ${templateBody}
    </main>
    <footer style="width: 100%;min-height: 80px;text-align: center;padding: 20px 0; font-size: 14px;">
      <div style="margin: 0 20px;">
        <nav>
          <a href="https://dadix.net" style="display: inline-block;line-height: 1.2;margin: 8px;color: inherit;text-decoration: underline;box-shadow: none;">Support</a>
          <a href="https://dadix.net" style="display: inline-block;line-height: 1.2;margin: 8px;color: inherit;text-decoration: underline;box-shadow: none;">Changelog</a>
          <a href="https://dadix.net" style="display: inline-block;line-height: 1.2;margin: 8px;color: inherit;text-decoration: underline;box-shadow: none;">Terms of Service </a>
          <a href="https://dadix.net" style="display: inline-block;line-height: 1.2;margin: 8px;color: inherit;text-decoration: underline;box-shadow: none;">Privacy Policy </a>
        </nav>
        <p style="max-width: 61ch;text-align: center;margin: 16px auto;line-height: 1.3;">
          You're receiving this email because it relates to your status update.
        </p>
      </div>
    </footer>
  </div>`;
};

const emailUtils = {
  emailTemplate,
  emailsBodyTemplates,
};

module.exports = emailUtils;
