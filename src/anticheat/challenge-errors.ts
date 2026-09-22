/** Komut pipeline — captcha görseli ile blok. */
export class ChallengeRequiredError extends Error {
  override readonly name = 'ChallengeRequiredError';

  constructor(
    message: string,
    readonly payload: {
      content: string;
      files: Array<{ attachment: Buffer; name: string }>;
    },
    readonly displayName: string,
  ) {
    super(message);
  }
}
