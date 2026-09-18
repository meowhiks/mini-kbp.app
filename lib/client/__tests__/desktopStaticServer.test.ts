import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveStaticFile, serveStaticRequest } from "../../../desktop/staticServer.js";

describe("desktop staticServer", () => {
  it("resolves .html and index.html candidates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minikbp-static-"));
    try {
      fs.mkdirSync(path.join(root, "app"), { recursive: true });
      fs.writeFileSync(path.join(root, "app", "index.html"), "<html>app</html>");
      fs.writeFileSync(path.join(root, "about.html"), "<html>about</html>");

      expect(resolveStaticFile(root, "/app")).toBe(path.join(root, "app", "index.html"));
      expect(resolveStaticFile(root, "/about")).toBe(path.join(root, "about.html"));
      expect(resolveStaticFile(root, "/missing")).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("serves files with content type", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minikbp-static-"));
    try {
      fs.writeFileSync(path.join(root, "index.html"), "<html>ok</html>");
      const res = await serveStaticRequest("minikbp://bundle/", root);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
      expect(await res.text()).toContain("ok");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
