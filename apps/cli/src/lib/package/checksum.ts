import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";

export async function sha256File(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
