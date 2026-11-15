// The public Site needs application-level authorization as well as dispatch access.
// Only a digest of the owner-access service credential is stored at runtime.
export async function authorizeWorker(
  request: Request,
  config: { key?: string; serviceTokenHash?: string },
) {
  const digest = async (value: string) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const same = (a: string, b: string) => {
    let difference = a.length ^ b.length;
    for (let i = 0; i < a.length; i++)
      difference |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
    return difference === 0;
  };
  const service = request.headers
    .get("x-finn-service-authorization")
    ?.replace(/^Bearer /, "");
  if (
    service &&
    service.length <= 8192 &&
    /^[a-f0-9]{64}$/.test(config.serviceTokenHash ?? "")
  ) {
    if (same(await digest(service), config.serviceTokenHash!)) return true;
  }
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  return !!(
    config.key &&
    config.key.length >= 32 &&
    supplied &&
    supplied.length <= 8192 &&
    same(await digest(config.key), await digest(supplied))
  );
}
