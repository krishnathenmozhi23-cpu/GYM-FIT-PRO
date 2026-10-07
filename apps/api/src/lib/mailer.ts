import { env } from "../config/env.js";
import { logger } from "./logger.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(email: Email): Promise<void>;
}

/**
 * ⚠️ DEVELOPMENT ONLY — does not send anything. Writes the email (including
 * one-time links) to the server log so flows can be tried locally. Refused
 * at startup in production. Implement a real provider (SMTP, SES, Postmark…)
 * behind the `Mailer` interface before launch.
 */
class ConsoleMailer implements Mailer {
  readonly enabled = true;
  readonly outbox: Email[] = [];
  async send(email: Email) {
    this.outbox.push(email);
    if (this.outbox.length > 50) this.outbox.shift();
    logger.info({ to: email.to, subject: email.subject, text: email.text }, "[DEV MAILER] email not sent — logged instead");
  }
}

class DisabledMailer implements Mailer {
  readonly enabled = false;
  async send() {
    throw new Error("Email is not configured");
  }
}

let mailer: Mailer = env.MAIL_PROVIDER === "console" ? new ConsoleMailer() : new DisabledMailer();

export function getMailer(): Mailer {
  return mailer;
}

/** DEVELOPMENT ONLY: recent emails captured by the console mailer (newest last). */
export function getDevOutbox(): Email[] | null {
  return mailer instanceof ConsoleMailer ? mailer.outbox : null;
}

/** Test hook. */
export function setMailerForTests(m: Mailer) {
  mailer = m;
}
