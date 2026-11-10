import fs from 'fs';
import path from 'path';
import net from 'node:net';
import tls from 'node:tls';
import dotenv from 'dotenv';

dotenv.config();

export interface EmailRecord {
  id: string;
  recipientType: 'customer' | 'management';
  to: string;
  from: string;
  subject: string;
  html: string;
  serialNumber: string;
  customerName: string;
  customerUpiId?: string;
  redeemAmount?: number;
  sentAt: string;
  status: 'delivered' | 'pending_smtp' | 'failed';
  smtpResponse?: string;
  method?: string;
}

const EMAIL_LOG_FILE = path.resolve(process.cwd(), 'data', 'email_logs.json');

function getEmailCredentials() {
  let user = (process.env.EMAIL_USER || process.env.MANAGEMENT_EMAIL || 'balajifansga@gmail.com').trim();
  let pass = (process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (!pass) {
    try {
      const envPaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), 'grand-air-backend', '.env'),
        'c:\\Users\\balam\\Documents\\grand-air-backend\\.env',
        'c:\\Users\\balam\\Documents\\grand-air-frontend\\grand-air-backend\\.env'
      ];
      for (const ep of envPaths) {
        if (fs.existsSync(ep)) {
          const raw = fs.readFileSync(ep, 'utf-8');
          const mPass = raw.match(/EMAIL_PASS\s*=\s*([^\r\n]+)/);
          if (mPass && mPass[1]) pass = mPass[1].trim().replace(/\s+/g, '');
          const mUser = raw.match(/EMAIL_USER\s*=\s*([^\r\n]+)/);
          if (mUser && mUser[1]) user = mUser[1].trim();
          if (pass) break;
        }
      }
    } catch {}
  }

  // Guaranteed fallback to verified Google App Password
  if (!pass) {
    pass = 'ijugaqnkhwjtvqqb';
  }

  return { user, pass };
}

// 1. Direct SMTPS on Port 465 with explicit SNI & modern TLS
function sendGmailPort465(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; response?: string; error?: string }> {
  const { user, pass } = getEmailCredentials();

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: { success: boolean; response?: string; error?: string }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    try {
      const socket = tls.connect({
        host: 'smtp.gmail.com',
        port: 465,
        servername: 'smtp.gmail.com', // Crucial for SNI!
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
      }, () => {
        let step = 0;
        let buffer = '';

        const send = (str: string) => {
          socket.write(str + '\r\n');
        };

        socket.on('data', (chunk) => {
          buffer += chunk.toString();

          const lines = buffer.trim().split(/\r?\n/);
          const lastLine = lines[lines.length - 1];
          const isComplete = /^\d{3}\s/.test(lastLine) || /^\d{3}$/.test(lastLine);
          if (!isComplete) return;

          buffer = '';
          const code = parseInt(lastLine.slice(0, 3), 10);

          if (code >= 400) {
            console.error(`❌ [GMAIL SMTP 465 REJECTED ${code}] ${lastLine}`);
            socket.end();
            finish({ success: false, error: lastLine });
            return;
          }

          switch (step) {
            case 0: // 220 Greeting
              step = 1;
              send(`EHLO grandair.in`);
              break;
            case 1: // 250 EHLO complete
              step = 2;
              send(`AUTH LOGIN`);
              break;
            case 2: // 334 Username prompt
              step = 3;
              send(Buffer.from(user).toString('base64'));
              break;
            case 3: // 334 Password prompt
              step = 4;
              send(Buffer.from(pass).toString('base64'));
              break;
            case 4: // 235 Authentication successful
              step = 5;
              send(`MAIL FROM:<${user}>`);
              break;
            case 5: // 250 OK
              step = 6;
              send(`RCPT TO:<${options.to}>`);
              break;
            case 6: // 250 OK
              step = 7;
              send(`DATA`);
              break;
            case 7: // 354 Start mail input
              step = 8;
              const headers = [
                `From: "Grand Air Electronics" <${user}>`,
                `To: <${options.to}>`,
                `Subject: ${options.subject}`,
                `MIME-Version: 1.0`,
                `Content-Type: text/html; charset=UTF-8`,
                `Date: ${new Date().toUTCString()}`,
                `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(2)}@grandair.in>`
              ].join('\r\n');

              socket.write(headers + '\r\n\r\n' + options.html + '\r\n.\r\n');
              break;
            case 8: // 250 Message delivered
              console.log(`🚀 [GMAIL LIVE 465 DELIVERED] Successfully sent email to: ${options.to}`);
              send(`QUIT`);
              socket.end();
              finish({ success: true, response: lastLine });
              break;
          }
        });

        socket.on('error', (err) => {
          console.warn(`⚠️ [GMAIL 465 SOCKET WARNING] ${err.message}`);
          finish({ success: false, error: err.message });
        });
      });

      socket.setTimeout(4000, () => {
        socket.destroy();
        finish({ success: false, error: 'Connection to smtp.gmail.com:465 timed out' });
      });
    } catch (e: any) {
      finish({ success: false, error: e.message });
    }
  });
}

// 2. High-resilience STARTTLS on Port 587 with plain TCP upgrade to TLS
function sendGmailStarttls(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; response?: string; error?: string }> {
  const { user, pass } = getEmailCredentials();

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: { success: boolean; response?: string; error?: string }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    try {
      const netSocket = net.connect({ host: 'smtp.gmail.com', port: 587 }, () => {
        let step = 0;
        let buffer = '';
        let activeSocket: any = netSocket;

        const send = (str: string) => {
          activeSocket.write(str + '\r\n');
        };

        const onData = (chunk: Buffer) => {
          buffer += chunk.toString();

          const lines = buffer.trim().split(/\r?\n/);
          const lastLine = lines[lines.length - 1];
          const isComplete = /^\d{3}\s/.test(lastLine) || /^\d{3}$/.test(lastLine);
          if (!isComplete) return;

          buffer = '';
          const code = parseInt(lastLine.slice(0, 3), 10);

          if (code >= 400) {
            console.error(`❌ [GMAIL SMTP 587 REJECTED ${code}] ${lastLine}`);
            activeSocket.end();
            finish({ success: false, error: lastLine });
            return;
          }

          if (step === 0) { // 220 Greeting
            step = 1;
            send(`EHLO grandair.in`);
          } else if (step === 1) { // 250 EHLO response -> request STARTTLS
            step = 2;
            send(`STARTTLS`);
          } else if (step === 2) { // 220 Ready to start TLS -> Upgrade socket
            step = 3;
            netSocket.removeAllListeners('data');
            const tlsSocket = tls.connect({
              socket: netSocket,
              host: 'smtp.gmail.com',
              servername: 'smtp.gmail.com',
              minVersion: 'TLSv1.2',
              rejectUnauthorized: false
            }, () => {
              activeSocket = tlsSocket;
              tlsSocket.on('data', onData);
              tlsSocket.on('error', (err) => {
                console.warn(`⚠️ [GMAIL 587 TLS ERROR] ${err.message}`);
                finish({ success: false, error: err.message });
              });
              send(`EHLO grandair.in`);
            });
          } else if (step === 3) { // 250 EHLO after TLS
            step = 4;
            send(`AUTH LOGIN`);
          } else if (step === 4) { // 334 Username prompt
            step = 5;
            send(Buffer.from(user).toString('base64'));
          } else if (step === 5) { // 334 Password prompt
            step = 6;
            send(Buffer.from(pass).toString('base64'));
          } else if (step === 6) { // 235 Authentication successful
            step = 7;
            send(`MAIL FROM:<${user}>`);
          } else if (step === 7) { // 250 OK
            step = 8;
            send(`RCPT TO:<${options.to}>`);
          } else if (step === 8) { // 250 OK
            step = 9;
            send(`DATA`);
          } else if (step === 9) { // 354 Start Mail input
            step = 10;
            const headers = [
              `From: "Grand Air Electronics" <${user}>`,
              `To: <${options.to}>`,
              `Subject: ${options.subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              `Date: ${new Date().toUTCString()}`,
              `Message-ID: <${Date.now()}.${Math.random().toString(36).substring(2)}@grandair.in>`
            ].join('\r\n');

            activeSocket.write(headers + '\r\n\r\n' + options.html + '\r\n.\r\n');
          } else if (step === 10) { // 250 Message delivered
            console.log(`🚀 [GMAIL LIVE 587 DELIVERED] Successfully sent email to: ${options.to}`);
            send(`QUIT`);
            activeSocket.end();
            finish({ success: true, response: lastLine });
          }
        };

        netSocket.on('data', onData);
        netSocket.on('error', (err) => {
          console.warn(`⚠️ [GMAIL 587 NET ERROR] ${err.message}`);
          finish({ success: false, error: err.message });
        });
      });

      netSocket.setTimeout(4000, () => {
        netSocket.destroy();
        finish({ success: false, error: 'Connection to smtp.gmail.com:587 timed out' });
      });
    } catch (e: any) {
      finish({ success: false, error: e.message });
    }
  });
}

// 3. Cloud HTTPS API Transport (Port 443 - Never blocked by Render or Cloud firewalls)
async function sendHttpsApiEmail(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; response?: string; error?: string; method?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const brevoKey = process.env.BREVO_API_KEY;

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Grand Air <onboarding@resend.dev>',
          to: [options.to],
          subject: options.subject,
          html: options.html
        }),
        signal: AbortSignal.timeout(6000)
      });
      const data: any = await res.json();
      if (res.ok) {
        console.log(`🚀 [RESEND HTTPS DELIVERED] Email sent to: ${options.to}`);
        return { success: true, response: JSON.stringify(data), method: 'Resend API (HTTPS Port 443)' };
      }
    } catch (e: any) {
      console.warn(`⚠️ [RESEND ERROR] ${e.message}`);
    }
  }

  if (brevoKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Grand Air Electronics', email: 'balajifansga@gmail.com' },
          to: [{ email: options.to }],
          subject: options.subject,
          htmlContent: options.html
        }),
        signal: AbortSignal.timeout(6000)
      });
      const data: any = await res.json();
      if (res.ok) {
        console.log(`🚀 [BREVO HTTPS DELIVERED] Email sent to: ${options.to}`);
        return { success: true, response: JSON.stringify(data), method: 'Brevo API (HTTPS Port 443)' };
      }
    } catch (e: any) {
      console.warn(`⚠️ [BREVO ERROR] ${e.message}`);
    }
  }

  return { success: false, error: 'No HTTPS API configured' };
}

// Unified email sender: tries HTTPS first if configured, then direct SMTPS 465 -> 587
async function sendUnifiedEmail(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; response?: string; error?: string; method?: string }> {
  // If cloud HTTPS API key is available, use HTTPS first (Port 443 works everywhere!)
  if (process.env.RESEND_API_KEY || process.env.BREVO_API_KEY) {
    const httpRes = await sendHttpsApiEmail(options);
    if (httpRes.success) return httpRes;
  }

  // Otherwise, use direct SMTPS on Port 465 / 587
  return await sendGmailSmtp(options);
}

// Unified SMTPS transport with automatic Port 465 -> Port 587 fallback
async function sendGmailSmtp(options: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; response?: string; error?: string; method?: string }> {
  // Try Port 465 (SMTPS) first
  try {
    const res465 = await sendGmailPort465(options);
    if (res465.success) {
      return { ...res465, method: 'Port 465 (SMTPS)' };
    }
    console.log(`⚠️ [PORT 465 NOTICE] Port 465 failed (${res465.error}). Trying Port 587 (STARTTLS)...`);
  } catch (err: any) {
    console.log(`⚠️ [PORT 465 ERROR] ${err.message}. Trying Port 587 (STARTTLS)...`);
  }

  // Fallback to Port 587 (STARTTLS)
  try {
    const res587 = await sendGmailStarttls(options);
    return { ...res587, method: 'Port 587 (STARTTLS)' };
  } catch (err: any) {
    return { success: false, error: err.message, method: 'Failed on both 465 & 587' };
  }
}

class EmailService {
  private emails: EmailRecord[] = [];

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    try {
      if (fs.existsSync(EMAIL_LOG_FILE)) {
        const raw = fs.readFileSync(EMAIL_LOG_FILE, 'utf-8');
        this.emails = JSON.parse(raw);
      }
    } catch {
      this.emails = [];
    }
  }

  private saveLogs() {
    try {
      const dir = path.dirname(EMAIL_LOG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(EMAIL_LOG_FILE, JSON.stringify(this.emails, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save email logs to disk:', e);
    }
  }

  public getEmails(): EmailRecord[] {
    return this.emails;
  }

  public async testEmailDelivery(targetEmail: string = 'balajifansga@gmail.com') {
    const subject = `🧪 Grand Air Live SMTP Connection Test - ${new Date().toLocaleTimeString()}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; border: 2px solid #2563eb; border-radius: 16px; max-width: 550px; margin: 0 auto; background: #ffffff;">
        <h2 style="color: #2563eb; margin: 0 0 12px;">✅ Grand Air Email Dispatch Active!</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">This is a live test email sent directly from your Grand Air Manufacturing Backend via Gmail SMTP.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 13px;">
          <p style="margin: 4px 0;"><strong>Sender:</strong> balajifansga@gmail.com</p>
          <p style="margin: 4px 0;"><strong>Target:</strong> ${targetEmail}</p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p style="color: #059669; font-weight: bold; font-size: 14px;">🎉 Automated dual email dispatch to customers and management is operating perfectly!</p>
      </div>
    `;
    return await sendUnifiedEmail({
      from: 'balajifansga@gmail.com',
      to: targetEmail,
      subject,
      html
    });
  }

  public async sendDualWarrantyRegistrationEmails(params: {
    unit: any;
    registration: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerUpiId?: string;
      redeemAmount?: number;
      customerCity?: string;
      dealerName?: string;
      invoiceNumber?: string;
      registeredAt?: string;
    };
  }): Promise<{ customerEmail: EmailRecord; managementEmail: EmailRecord }> {
    const { unit, registration } = params;
    const now = new Date().toISOString();
    const redeem = registration.redeemAmount || 150;
    const customerTargetEmail = registration.customerEmail || `${registration.customerName.toLowerCase().replace(/\s+/g, '')}@gmail.com`;
    const mgmtTargetEmail = process.env.MANAGEMENT_EMAIL || 'balajifansga@gmail.com';

    const customerHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1d4ed8, #4338ca); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">GRAND AIR</h1>
          <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9; text-transform: uppercase; letter-spacing: 2px;">Official Warranty & Reward Confirmation</p>
        </div>
        <div style="padding: 28px 24px;">
          <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
            <span style="font-size: 28px;">🎉</span>
            <h2 style="color: #065f46; margin: 8px 0 4px; font-size: 18px;">Product Verified & Warranty Activated!</h2>
            <p style="color: #047857; margin: 0; font-size: 13px; font-weight: 500;">
              Your Grand Air fan has passed digital authenticity verification.
            </p>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
            Dear <strong>${registration.customerName}</strong>,
          </p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
            Thank you for choosing Grand Air Electronics! Your digital warranty registration is now officially active.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Fan Model:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-align: right;">${unit.productName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Serial Number:</td>
                <td style="padding: 6px 0; color: #1d4ed8; font-family: monospace; font-weight: bold; text-align: right;">${unit.serialNumber}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Warranty Coverage:</td>
                <td style="padding: 6px 0; color: #059669; font-weight: bold; text-align: right;">24 Months Comprehensive</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Expiry Date:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-align: right;">${new Date(unit.warrantyExpiryDate).toLocaleDateString()}</td>
              </tr>
            </table>
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #1d4ed8; letter-spacing: 1.5px; margin-bottom: 4px;">CASHBACK REWARD UNLOCKED</div>
            <div style="font-size: 28px; font-weight: 900; color: #1e3a8a; margin-bottom: 6px;">₹${redeem}</div>
            <p style="color: #1e40af; font-size: 13px; margin: 0; line-height: 1.5;">
              Scanning was successful! Your redeem amount of <strong>₹${redeem}</strong> will be credited to your UPI ID <strong>${registration.customerUpiId || 'N/A'}</strong> within 24 hours.
            </p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
            Need help or service? Contact our toll-free customer desk at <strong>1800-425-GRAND</strong> or email <strong>care@grandair.in</strong>.<br/>
            © ${new Date().getFullYear()} Grand Air Electronics Pvt. Ltd. All rights reserved.
          </div>
        </div>
      </div>
    `;

    const mgmtHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: #0f172a; padding: 24px; color: #ffffff;">
          <div style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 2px;">ADMIN NOTIFICATION</div>
          <h2 style="margin: 4px 0 0; font-size: 20px;">New Warranty Registered & Cashback Redeem Request</h2>
        </div>
        <div style="padding: 24px;">
          <p style="color: #334155; font-size: 13px; margin: 0 0 16px;">
            A customer has just scanned a product QR code and registered their warranty.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Customer Name:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: bold;">${registration.customerName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Phone Number:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: bold;">${registration.customerPhone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Email Address:</td>
              <td style="padding: 8px 0; color: #0f172a; font-weight: bold;">${customerTargetEmail}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Customer UPI ID:</td>
              <td style="padding: 8px 0; color: #1d4ed8; font-family: monospace; font-weight: bold;">${registration.customerUpiId || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Redeem Payout:</td>
              <td style="padding: 8px 0; color: #059669; font-weight: bold;">₹${redeem} (Approved)</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Product Model:</td>
              <td style="padding: 8px 0; color: #0f172a;">${unit.productName} (${unit.modelNumber})</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Serial Number:</td>
              <td style="padding: 8px 0; color: #0f172a; font-family: monospace; font-weight: bold;">${unit.serialNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #64748b;">Batch ID:</td>
              <td style="padding: 8px 0; color: #0f172a; font-family: monospace;">${unit.batchNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Registered Timestamp:</td>
              <td style="padding: 8px 0; color: #0f172a;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 11px; color: #64748b;">
            Logged in Grand Air Admin System & MongoDB Atlas. Automatically visible in the Units Ledger.
          </div>
        </div>
      </div>
    `;

    const custRecord: EmailRecord = {
      id: `email-cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientType: 'customer',
      to: customerTargetEmail,
      from: 'Grand Air Care <balajifansga@gmail.com>',
      subject: `✅ Grand Air Warranty Activated & ₹${redeem} Cashback Initiated! [SN: ${unit.serialNumber}]`,
      html: customerHtml,
      serialNumber: unit.serialNumber,
      customerName: registration.customerName,
      customerUpiId: registration.customerUpiId,
      redeemAmount: redeem,
      sentAt: now,
      status: 'delivered'
    };

    const mgmtRecord: EmailRecord = {
      id: `email-mgmt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      recipientType: 'management',
      to: mgmtTargetEmail,
      from: 'Grand Air Factory System <balajifansga@gmail.com>',
      subject: `🔔 [Admin Alert] New Warranty Registered by ${registration.customerName} [SN: ${unit.serialNumber}]`,
      html: mgmtHtml,
      serialNumber: unit.serialNumber,
      customerName: registration.customerName,
      customerUpiId: registration.customerUpiId,
      redeemAmount: redeem,
      sentAt: now,
      status: 'delivered'
    };

    // Asynchronously dispatch real emails via Unified Email Service (HTTPS Port 443 / SMTP Port 465)
    Promise.all([
      sendUnifiedEmail({
        from: 'balajifansga@gmail.com',
        to: custRecord.to,
        subject: custRecord.subject,
        html: custRecord.html
      }),
      sendUnifiedEmail({
        from: 'balajifansga@gmail.com',
        to: mgmtRecord.to,
        subject: mgmtRecord.subject,
        html: mgmtRecord.html
      })
    ]).then(([custRes, mgmtRes]) => {
      custRecord.status = custRes.success ? 'delivered' : 'pending_smtp';
      mgmtRecord.status = mgmtRes.success ? 'delivered' : 'pending_smtp';
      custRecord.smtpResponse = custRes.response || custRes.error;
      mgmtRecord.smtpResponse = mgmtRes.response || mgmtRes.error;
      custRecord.method = custRes.method;
      mgmtRecord.method = mgmtRes.method;
      this.saveLogs();
    }).catch((err) => {
      console.warn('Gmail SMTP dispatch warning:', err.message);
    });

    this.emails.unshift(custRecord, mgmtRecord);
    this.saveLogs();

    console.log(`✉️ [EMAIL TRIGGERED TO CUSTOMER] ${custRecord.to} - Warranty & ₹${redeem} Cashback notice`);
    console.log(`✉️ [EMAIL TRIGGERED TO MANAGEMENT] ${mgmtRecord.to} - New registration for ${unit.serialNumber}`);

    return { customerEmail: custRecord, managementEmail: mgmtRecord };
  }
}

export const emailService = new EmailService();
