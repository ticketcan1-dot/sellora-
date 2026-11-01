export function authDestination(value: unknown) {
  if (value === "/recuperation") return value;
  if (
    typeof value === "string" &&
    /^\/invitation\/[A-Za-z0-9_-]{43}$/.test(value)
  )
    return value;
  return "/app";
}
