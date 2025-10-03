import nodemailer from 'nodemailer';
import { env } from '../config/envConfig.js';

let transporter;

export function getMailer() {
  if (transporter) return transporter;
  
  // Check if SMTP config is available
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('SMTP configuration missing. Email sending will be disabled.');
    return null;
  }
  
  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
    return transporter;
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
}

export async function sendEmail({ to, subject, html }) {
  try {
    const mailer = getMailer();
    if (!mailer) {
      console.warn('Email transporter not available. Skipping email send.');
      return { success: false, error: 'Email service not configured' };
    }
    
    const result = await mailer.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to,
      subject,
      html
    });
    
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}
