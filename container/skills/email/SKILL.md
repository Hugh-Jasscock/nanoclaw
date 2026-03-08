---
name: email
description: Send emails from Woodrow's iCloud email account. Use when the user asks to send an email, forward information, or email a document to someone.
allowed-tools: Bash(email:*)
---

# Email

Send emails via Woodrow's iCloud SMTP account using nodemailer.

## Sending an email

Write a script to `/tmp/send-email.mjs` and run it:

```javascript
// /tmp/send-email.mjs
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.mail.me.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ICLOUD_EMAIL,
    pass: process.env.ICLOUD_APP_PASSWORD,
  },
});

await transporter.sendMail({
  from: process.env.ICLOUD_EMAIL,
  to: 'recipient@example.com',
  subject: 'Subject line',
  text: 'Plain text body',
  // html: '<h1>HTML body</h1>', // optional
  // attachments: [{ filename: 'report.docx', path: '/workspace/group/report.docx' }], // optional
});

console.log('Email sent');
```

Run: `ICLOUD_EMAIL="$ICLOUD_EMAIL" ICLOUD_APP_PASSWORD="$ICLOUD_APP_PASSWORD" node /tmp/send-email.mjs`

## With attachments

Add the `attachments` array to `sendMail()`:

```javascript
attachments: [
  { filename: 'report.docx', path: '/workspace/group/report.docx' },
  { filename: 'photo.jpg', path: '/workspace/group/images/tg-123.jpg' },
]
```

## Important

- The ICLOUD_EMAIL and ICLOUD_APP_PASSWORD environment variables are pre-configured
- Always confirm with the user before sending an email (recipient, subject, content)
- For documents, generate the file first (see `documents` skill), then attach it
