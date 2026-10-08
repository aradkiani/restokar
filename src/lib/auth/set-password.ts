import "server-only";
import { prisma } from "../prisma";
import { hashPassword } from "./password";
import { clearLoginFailures } from "./login-guard";

/**
 * Gives an account a new password and signs it out everywhere.
 *
 * The one writer for every way a password is replaced on someone's behalf or
 * after a forgotten one — a texted reset code, the venue owner for their staff,
 * platform staff for an owner. Ending every session is the point: whoever
 * might have known or guessed the old password loses the access it gave, and a
 * device the person left signed in somewhere is signed out too.
 *
 * The wrong-password count for the number is cleared, so someone locked out by
 * their own guesses can use the new password at once.
 */
export async function replacePassword(
  user: { id: string; phone: string | null },
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  if (user.phone) await clearLoginFailures(user.phone);
}
