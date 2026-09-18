import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, Database } from "../../src/database.js";
import { parseRegistrationMode, resolveRegistrationMode, resolveRuntimeSecurity } from "../../src/security.js";
import {
  formatRegistrationInviteCode,
  isNormalizedRegistrationInviteCode,
  normalizeRegistrationInviteCode
} from "../../src/user-auth.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("三级注册开关", () => {
  it("把 APP_ALLOW_REGISTRATION 解析为互斥的 disabled、invite 和 open", () => {
    expect(parseRegistrationMode(undefined)).toBe("disabled");
    expect(parseRegistrationMode("false")).toBe("disabled");
    expect(parseRegistrationMode("0")).toBe("disabled");
    expect(parseRegistrationMode("yes")).toBe("disabled");
    expect(parseRegistrationMode("TRUE")).toBe("disabled");
    expect(parseRegistrationMode("invite")).toBe("invite");
    expect(parseRegistrationMode("true")).toBe("open");
    expect(parseRegistrationMode("1")).toBe("open");
  });

  it("兼容测试里的 allowRegistration，且显式 registrationMode 优先", () => {
    expect(resolveRegistrationMode()).toBe("disabled");
    expect(resolveRegistrationMode({ allowRegistration: true })).toBe("open");
    expect(resolveRegistrationMode({ allowRegistration: false })).toBe("disabled");
    expect(resolveRegistrationMode({ registrationMode: "invite", allowRegistration: true })).toBe("invite");
    expect(resolveRegistrationMode({ registrationMode: "disabled", allowRegistration: true })).toBe("disabled");
  });

  it("invite 与开放注册都要求初始化令牌", () => {
    const setupToken = "registration-invite-unit-setup-token-32-chars";
    expect(() => resolveRuntimeSecurity({ APP_ALLOW_REGISTRATION: "invite" })).toThrow("APP_SETUP_TOKEN");
    expect(resolveRuntimeSecurity({
      APP_ALLOW_REGISTRATION: "invite",
      APP_SETUP_TOKEN: setupToken
    })).toMatchObject({
      registrationMode: "invite",
      allowRegistration: true,
      setupToken
    });
  });
});

describe("注册邀请码格式", () => {
  it("去掉空格和短横线后再规范化为大写", () => {
    expect(normalizeRegistrationInviteCode("ab2d-efgh-jk3m-np4q")).toBe("AB2DEFGHJK3MNP4Q");
    expect(normalizeRegistrationInviteCode(" ab2d efgh jk3m np4q ")).toBe("AB2DEFGHJK3MNP4Q");
    expect(formatRegistrationInviteCode("AB2DEFGHJK3MNP4Q")).toBe("AB2D-EFGH-JK3M-NP4Q");
    expect(isNormalizedRegistrationInviteCode("AB2DEFGHJK3MNP4Q")).toBe(true);
    expect(isNormalizedRegistrationInviteCode("AB2D-EFGH-JK3M-NP4Q")).toBe(false);
    expect(isNormalizedRegistrationInviteCode("AB2DEFGHJK3MNP4I")).toBe(false);
  });
});

describe("注册邀请码表迁移", () => {
  it("空库迁移后创建 registration_invites 及其索引", () => {
    const root = mkdtempSync(join(tmpdir(), "scriverse-invite-schema-"));
    roots.push(root);
    const database = new Database(join(root, "novel.db"));
    expect(database.get("SELECT MAX(version) AS version FROM schema_migrations")).toEqual({ version: DATABASE_SCHEMA_VERSION });
    expect(database.all("PRAGMA table_info(registration_invites)").map((column) => column.name)).toEqual([
      "id",
      "code_hash",
      "created_by_user_id",
      "created_at",
      "used_at",
      "used_by_user_id"
    ]);
    const indexes = database.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'registration_invites' ORDER BY name"
    ).map((row) => row.name);
    expect(indexes).toEqual(expect.arrayContaining([
      "idx_registration_invites_created",
      "idx_registration_invites_unused"
    ]));
    database.close();
  });
});
