import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRuntime, type Runtime } from "../../src/app.js";
import { MAX_UNUSED_REGISTRATION_INVITES } from "../../src/user-auth.js";

const setupToken = "invite-registration-test-setup-token-32ch";
const password = "secure-password-123";

type SessionCredentials = {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  user: { userId: string; username: string; role: "admin" | "user" };
};

function createAuthRuntime(security: {
  registrationMode?: "disabled" | "invite" | "open";
  allowRegistration?: boolean;
}): Runtime {
  return createRuntime({
    databasePath: ":memory:",
    masterSecret: "invite-registration-test-master-secret-32",
    serveUi: false,
    revealCaptchaAnswer: true,
    security: { enforceSameOrigin: true, setupToken, ...security }
  });
}

async function solveCaptcha(app: Runtime["app"]): Promise<{ captchaId: string; captchaAnswer: string }> {
  const response = await request(app).get("/api/auth/captcha").expect(200);
  return { captchaId: response.body.data.captchaId, captchaAnswer: response.body.data.answer };
}

async function registerUser(
  runtime: Runtime,
  username: string,
  extra: { inviteCode?: string; setupToken?: string } = {}
): Promise<SessionCredentials> {
  const agent = request.agent(runtime.app);
  const captcha = await solveCaptcha(runtime.app);
  const response = await agent.post("/api/auth/register").send({
    username,
    password,
    passwordConfirmation: password,
    setupToken: extra.setupToken ?? setupToken,
    inviteCode: extra.inviteCode,
    ...captcha
  }).expect(201);
  return { agent, csrfToken: response.body.data.csrfToken, user: response.body.data.user };
}

async function submitDesktopRegister(
  runtime: Runtime,
  username: string,
  extra: { inviteCode?: string; setupToken?: string; profileId?: string } = {}
) {
  const captcha = await solveCaptcha(runtime.app);
  return request(runtime.app).post("/api/desktop/auth/register").send({
    username,
    password,
    passwordConfirmation: password,
    setupToken: extra.setupToken ?? setupToken,
    inviteCode: extra.inviteCode,
    desktopId: "22222222-2222-4222-8222-222222222222",
    profileId: extra.profileId ?? "11111111-1111-4111-8111-111111111111",
    clientVersion: "1.0.11",
    ...captcha
  });
}

describe("邀请码注册 API", () => {
  it("invite 模式首位管理员不消耗邀请码，后续注册必须一次性核销", async () => {
    const runtime = createAuthRuntime({ registrationMode: "invite" });
    try {
      const emptySession = await request(runtime.app).get("/api/auth/session").expect(200);
      expect(emptySession.body.data).toMatchObject({
        authenticated: false,
        setupRequired: true,
        setupTokenRequired: true,
        registrationMode: "invite",
        registrationOpen: true,
        inviteRequired: false
      });

      const missingSetup = await request(runtime.app).post("/api/auth/register").send({
        username: "first_admin",
        password,
        passwordConfirmation: password,
        ...(await solveCaptcha(runtime.app))
      }).expect(403);
      expect(missingSetup.body.error.code).toBe("SETUP_TOKEN_INVALID");

      const admin = await registerUser(runtime, "first_admin");
      expect(admin.user).toMatchObject({ role: "admin" });
      expect(runtime.database.get("SELECT COUNT(*) AS count FROM registration_invites")).toEqual({ count: 0 });

      const readySession = await request(runtime.app).get("/api/auth/session").expect(200);
      expect(readySession.body.data).toMatchObject({
        setupRequired: false,
        registrationMode: "invite",
        registrationOpen: true,
        inviteRequired: true
      });

      const missingInvite = await request(runtime.app).post("/api/auth/register").send({
        username: "needs_invite",
        password,
        passwordConfirmation: password,
        ...(await solveCaptcha(runtime.app))
      }).expect(400);
      expect(missingInvite.body.error.code).toBe("INVITE_CODE_REQUIRED");

      const writerDenied = await request(runtime.app).get("/api/registration-invites").expect(401);
      expect(writerDenied.body.error.code).toBe("AUTH_REQUIRED");
      const csrfDenied = await admin.agent.post("/api/registration-invites").send({}).expect(403);
      expect(csrfDenied.body.error.code).toBe("CSRF_TOKEN_INVALID");

      const created = await admin.agent.post("/api/registration-invites")
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(201);
      expect(created.body.data.code).toMatch(/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/u);
      expect(created.body.data.usedAt).toBeNull();
      const inviteCode = String(created.body.data.code);
      const inviteId = String(created.body.data.id);
      expect(runtime.database.get("SELECT code_hash FROM registration_invites WHERE id = ?", inviteId)).toEqual({
        code_hash: createHash("sha256").update(inviteCode.replaceAll("-", "")).digest("hex")
      });

      const listed = await admin.agent.get("/api/registration-invites").expect(200);
      expect(listed.body.data).toMatchObject({
        registrationMode: "invite",
        registrationOpen: true
      });
      expect(listed.body.data.items[0]).toMatchObject({ id: inviteId, usedAt: null, usedBy: null });
      expect(listed.body.data.items[0]).not.toHaveProperty("code");
      expect(JSON.stringify(listed.body.data)).not.toContain(inviteCode);

      const invalidInvite = await request(runtime.app).post("/api/auth/register").send({
        username: "bad_invite",
        password,
        passwordConfirmation: password,
        inviteCode: "0000-0000-0000-0000",
        ...(await solveCaptcha(runtime.app))
      }).expect(403);
      expect(invalidInvite.body.error.code).toBe("INVITE_CODE_INVALID");

      const spacedCode = inviteCode.toLocaleLowerCase("en-US").replaceAll("-", " - ");
      const invited = await registerUser(runtime, "invited_writer", { inviteCode: spacedCode });
      expect(invited.user).toMatchObject({ role: "user", username: "invited_writer" });
      expect(runtime.database.get(
        "SELECT used_by_user_id FROM registration_invites WHERE id = ?",
        inviteId
      )).toEqual({ used_by_user_id: invited.user.userId });

      const reused = await request(runtime.app).post("/api/auth/register").send({
        username: "second_writer",
        password,
        passwordConfirmation: password,
        inviteCode,
        ...(await solveCaptcha(runtime.app))
      }).expect(403);
      expect(reused.body.error.code).toBe("INVITE_CODE_INVALID");
      expect(runtime.database.get("SELECT COUNT(*) AS count FROM users WHERE username = 'second_writer'")).toEqual({ count: 0 });

      const writerForbidden = await invited.agent.get("/api/registration-invites").expect(403);
      expect(writerForbidden.body.error.code).toBe("ADMIN_REQUIRED");
      const writerCreate = await invited.agent.post("/api/registration-invites")
        .set("X-CSRF-Token", invited.csrfToken)
        .send({})
        .expect(403);
      expect(writerCreate.body.error.code).toBe("ADMIN_REQUIRED");

      expect(runtime.database.all(
        "SELECT action FROM audit_logs WHERE action IN ('user.registered', 'registration-invite.created') ORDER BY created_at, id"
      ).map((row) => row.action)).toEqual([
        "user.registered",
        "registration-invite.created",
        "user.registered"
      ]);
    } finally {
      await runtime.close();
    }
  });

  it("Desktop 注册核销邀请码且禁用注册时拒绝网页和 Desktop 入口", async () => {
    const inviteRuntime = createAuthRuntime({ registrationMode: "invite" });
    try {
      const admin = await registerUser(inviteRuntime, "desktop_admin");
      const created = await admin.agent.post("/api/registration-invites")
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(201);
      const inviteCode = String(created.body.data.code);

      const missing = await submitDesktopRegister(inviteRuntime, "desktop_writer");
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe("INVITE_CODE_REQUIRED");

      const registered = await submitDesktopRegister(inviteRuntime, "desktop_writer", { inviteCode });
      expect(registered.status).toBe(201);
      expect(registered.headers["set-cookie"]).toBeUndefined();
      expect(registered.headers["cache-control"]).toBe("no-store");
      expect(registered.body.data).toMatchObject({
        token: expect.stringMatching(/^scrvd_[A-Za-z0-9_-]{43}$/u),
        user: { username: "desktop_writer", role: "user" }
      });
      const reused = await submitDesktopRegister(inviteRuntime, "desktop_writer_two", {
        inviteCode,
        profileId: "33333333-3333-4333-8333-333333333333"
      });
      expect(reused.status).toBe(403);
      expect(reused.body.error.code).toBe("INVITE_CODE_INVALID");
    } finally {
      await inviteRuntime.close();
    }

    const disabledRuntime = createAuthRuntime({ allowRegistration: false });
    try {
      const session = await request(disabledRuntime.app).get("/api/auth/session").expect(200);
      expect(session.body.data).toMatchObject({
        registrationMode: "disabled",
        registrationOpen: false,
        inviteRequired: false
      });
      const webRejected = await request(disabledRuntime.app).post("/api/auth/register").send({
        username: "blocked_web",
        password,
        passwordConfirmation: password,
        ...(await solveCaptcha(disabledRuntime.app))
      }).expect(403);
      expect(webRejected.body.error.code).toBe("REGISTRATION_DISABLED");
      const desktopRejected = await submitDesktopRegister(disabledRuntime, "blocked_desktop");
      expect(desktopRejected.status).toBe(403);
      expect(desktopRejected.body.error.code).toBe("REGISTRATION_DISABLED");
    } finally {
      await disabledRuntime.close();
    }
  });

  it("开放注册忽略邀请码，API Key 不能管理邀请码，未使用邀请码有上限", async () => {
    const runtime = createAuthRuntime({ allowRegistration: true });
    try {
      const admin = await registerUser(runtime, "open_admin");
      const created = await admin.agent.post("/api/registration-invites")
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(201);
      const unusedInvite = String(created.body.data.code);
      const writer = await registerUser(runtime, "open_writer", { inviteCode: unusedInvite });
      expect(writer.user.role).toBe("user");
      expect(runtime.database.get(
        "SELECT used_at FROM registration_invites WHERE id = ?",
        created.body.data.id
      )).toEqual({ used_at: null });

      const apiKeyReset = await admin.agent.post("/api/auth/api-key/reset")
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(200);
      const apiKey = String(apiKeyReset.body.data.apiKey);
      const listDenied = await request(runtime.app).get("/api/registration-invites")
        .set("Authorization", `Bearer ${apiKey}`)
        .expect(403);
      expect(listDenied.body.error.code).toBe("CLI_SCOPE_DENIED");
      const createDenied = await request(runtime.app).post("/api/registration-invites")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({})
        .expect(403);
      expect(createDenied.body.error.code).toBe("CLI_SCOPE_DENIED");

      runtime.database.run("DELETE FROM registration_invites");
      const timestamp = new Date().toISOString();
      for (let index = 0; index < MAX_UNUSED_REGISTRATION_INVITES; index += 1) {
        runtime.database.run(
          `INSERT INTO registration_invites (id, code_hash, created_by_user_id, created_at)
           VALUES (?, ?, ?, ?)`,
          randomUUID(),
          createHash("sha256").update(`limit-${index}`).digest("hex"),
          admin.user.userId,
          timestamp
        );
      }
      const limited = await admin.agent.post("/api/registration-invites")
        .set("X-CSRF-Token", admin.csrfToken)
        .send({})
        .expect(409);
      expect(limited.body.error.code).toBe("INVITE_CODE_LIMIT");
    } finally {
      await runtime.close();
    }
  });
});
