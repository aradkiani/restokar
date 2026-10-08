/**
 * Sets a new password for any account, from the server's own shell.
 *
 *   npm run user:set-password -- 09XXXXXXXXX
 *
 * The way back in for the platform admin, whom the sign-in page deliberately
 * never resets by SMS (a stolen SIM must not open the console), and a fallback
 * for anyone else when texting is down. Running it needs shell access to the
 * server, which is the proof of authority here.
 *
 * Asks for the password on the terminal rather than taking it as an argument,
 * so it does not land in the shell history. Every session of the account ends
 * and its wrong-password count is cleared. Recorded in the audit log.
 */
// MUST be first: populates process.env before src/lib/env.ts is evaluated.
import "./load-env";
import { createInterface } from "node:readline/promises";
import { prisma } from "../src/lib/prisma";
import { normalisePhone } from "../src/lib/phone";
import {
  PASSWORD_MESSAGES,
  hashPassword,
  passwordProblem,
} from "../src/lib/auth/password";

async function main(): Promise<number> {
  const phone = normalisePhone(process.argv[2]);
  if (!phone) {
    console.error("Usage: npm run user:set-password -- 09XXXXXXXXX");
    return 1;
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true, role: true, restaurantId: true, isActive: true },
  });
  if (!user) {
    console.error(`No account uses ${phone}.`);
    return 1;
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const password = (
    await terminal.question(`New password for ${user.name} (${user.role}): `)
  ).trim();
  terminal.close();

  const problem = passwordProblem(password, { phone });
  if (problem) {
    console.error(PASSWORD_MESSAGES[problem]);
    return 1;
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.rateLimit.deleteMany({ where: { key: `login-fail:phone:${phone}` } }),
    prisma.auditLog.create({
      data: {
        restaurantId: user.restaurantId,
        actorLabel: "scripts/set-password",
        actorRole: "SUPER_ADMIN",
        action: "PASSWORD_CHANGED",
        summary: `رمز عبور ${user.name} (${phone}) از روی سرور تعیین شد`,
        entityType: "User",
        entityId: user.id,
      },
    }),
  ]);

  console.log(
    `Password set for ${user.name}. All their sessions were ended${user.isActive ? "" : " (the account is inactive)"}.`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
