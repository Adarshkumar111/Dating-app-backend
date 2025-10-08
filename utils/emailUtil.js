import nodemailer from 'nodemailer';
import { env } from '../config/envConfig.js';

// Simple transporter like your working code
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(env.SMTP_PORT || 587),
  secure: Number(env.SMTP_PORT || 587) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS
  }
});

// Verify on startup
if (env.SMTP_USER && env.SMTP_PASS) {
  transporter.verify()
    .then(() => console.log('✅ SMTP transporter ready'))
    .catch((err) => console.warn('⚠️ SMTP verification failed:', err?.message || err));
}

// Simple sendEmail like your working code
// kind: 'system' (signup/forgot) or 'user' (request/accept) - only user emails can be toggled off
export async function sendEmail(arg1, arg2 = {}, arg3) {
  try {
    // Backward compatibility: allow sendEmail(to, subject, html)
    let to, subject, html, opts;
    if (typeof arg1 === 'string') {
      to = arg1;
      subject = arg2 || '';
      html = arg3 || '';
      opts = {};
    } else {
      ({ to, subject, html } = arg1 || {});
      opts = arg2 || {};
    }
    
    const kind = opts.kind || 'system';
    
    // Admin can disable only user-to-user mails
    if (kind === 'user' && !env.USER_EMAILS_ENABLED) {
      console.warn('User-to-user email suppressed by USER_EMAILS_ENABLED=false');
      return { success: false, error: 'User emails disabled' };
    }
    
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      console.warn('SMTP not configured. Skipping email send.');
      return { success: false, error: 'Email service not configured' };
    }
    
    // Simple sendMail like your working code
    const mailOptions = {
      from: env.SENDER_EMAIL || env.SMTP_FROM || env.SMTP_USER,
      to,
      subject,
      html: html || '',
      text: html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to:', to, 'messageId:', info?.messageId || 'n/a');
    return { success: true, messageId: info?.messageId };
  } catch (error) {
    console.error('❌ Email send failed:', error.message);
    return { success: false, error: error.message };
  }
}
