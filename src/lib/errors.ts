/**
 * Maps server-function error codes to user-facing messages.
 * Prevents the old behaviour where every failure (network, validation, 404)
 * was reported as "You don't have permission to do that."
 */
export function opErrorMessage(t: (s: string) => string, code: string | undefined): string {
  switch (code) {
    case "forbidden":
    case "access_denied":
      return t("You don't have permission to do that.");
    case "not_found":
      return t("This item could not be found.");
    case "email_exists":
      return t("This email is already registered.");
    case "already_shared":
      return t("This person is already shared on the case.");
    default:
      return t("Something went wrong. Please try again.");
  }
}
