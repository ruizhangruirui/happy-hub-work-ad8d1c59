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
    case "offboarding_exists":
      return t("An offboarding case already exists for this employment.");
    case "storage_failed":
      return t("The file could not be removed from secure storage. Please try again.");
    case "storage_metadata_mismatch":
      return t("The file was removed, but its record needs administrator cleanup.");
    case "invalid_lifecycle":
      return t("This lifecycle change is not valid for the current Case state.");
    case "validation_failed":
      return t("Check the required fields and try again.");
    default:
      return t("Something went wrong. Please try again.");
  }
}
