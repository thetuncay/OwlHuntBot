import type { User } from 'discord.js';

export async function notifyCaptchaViaDm(user: User, content: string): Promise<boolean> {
  try {
    const dm = await user.createDM();
    await dm.send({ content });
    return true;
  } catch {
    return false;
  }
}
