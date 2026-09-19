import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Runtime } from "../../src/app.js";
import { createTestRuntime } from "../helpers.js";

describe("角色属性入库剪枝", () => {
  let runtime: Runtime;
  let workId: string;

  beforeEach(async () => {
    runtime = createTestRuntime();
    const response = await request(runtime.app).post("/api/works").send({ title: "属性剪枝作品" });
    workId = response.body.data.id;
  });
  afterEach(() => runtime.close());

  it("创建角色时把混写属性折入 identity 与 details，并丢掉空字段", async () => {
    const created = await request(runtime.app).post(`/api/works/${workId}/characters`).send({
      name: "陈阿生",
      attributes: {
        身份定位: "主角(待正文起笔后随剧情演进)",
        修为: "故事开局,未踏入修行;修仙路为本书主线成长线",
        阶层: "水乡船户人家",
        identity: "",
        details: [{ label: "身高·", value: "1米1" }]
      }
    }).expect(201);

    expect(created.body.data.attributes).toEqual({
      identity: "主角(待正文起笔后随剧情演进)",
      details: [
        { label: "修为", value: "故事开局,未踏入修行;修仙路为本书主线成长线" },
        { label: "阶层", value: "水乡船户人家" },
        { label: "身高", value: "1米1" }
      ]
    });
    expect(created.body.data.attributes).not.toHaveProperty("身份定位");
    expect(created.body.data.attributes).not.toHaveProperty("修为");

    const fetched = await request(runtime.app).get(`/api/characters/${created.body.data.id}`).expect(200);
    expect(fetched.body.data.attributes).toEqual(created.body.data.attributes);
  });

  it("更新角色时按表单结构覆盖，不再保留无法编辑的额外键", async () => {
    const created = await request(runtime.app).post(`/api/works/${workId}/characters`).send({
      name: "陈阿生",
      attributes: { 修为: "炼气一层", identity: "船户" }
    }).expect(201);
    expect(created.body.data.attributes).toEqual({
      identity: "船户",
      details: [{ label: "修为", value: "炼气一层" }]
    });

    const updated = await request(runtime.app).patch(`/api/characters/${created.body.data.id}`).send({
      attributes: {
        identity: "船户少年",
        details: [{ label: "修为", value: "炼气三层" }]
      }
    }).expect(200);
    expect(updated.body.data.attributes).toEqual({
      identity: "船户少年",
      details: [{ label: "修为", value: "炼气三层" }]
    });
  });

  it("读取已入库的混写属性时当场剪枝，且不改动 profile", async () => {
    const created = await request(runtime.app).post(`/api/works/${workId}/characters`).send({
      name: "陈阿生",
      profile: { secret: "不得出现在扩展属性里", summary: "船户少年" }
    }).expect(201);

    runtime.store.db.run(
      "UPDATE characters SET attributes_json = ? WHERE id = ?",
      JSON.stringify({
        身份定位: "主角",
        修为: "未踏入修行",
        identity: "",
        details: [{ label: "身高·", value: "1米1" }]
      }),
      created.body.data.id
    );

    const fetched = await request(runtime.app).get(`/api/characters/${created.body.data.id}`).expect(200);
    expect(fetched.body.data.attributes).toEqual({
      identity: "主角",
      details: [
        { label: "修为", value: "未踏入修行" },
        { label: "身高", value: "1米1" }
      ]
    });
    expect(fetched.body.data.profile).toMatchObject({
      secret: "不得出现在扩展属性里",
      summary: "船户少年"
    });
  });

  it("只改名称也会把库里的混写属性写回规范结构", async () => {
    const created = await request(runtime.app).post(`/api/works/${workId}/characters`).send({
      name: "陈阿生"
    }).expect(201);
    runtime.store.db.run(
      "UPDATE characters SET attributes_json = ? WHERE id = ?",
      JSON.stringify({ 身份定位: "主角", 修为: "未踏入修行", identity: "" }),
      created.body.data.id
    );

    const updated = await request(runtime.app).patch(`/api/characters/${created.body.data.id}`).send({
      name: "陈阿生·改"
    }).expect(200);
    expect(updated.body.data.attributes).toEqual({
      identity: "主角",
      details: [{ label: "修为", value: "未踏入修行" }]
    });
    const stored = runtime.store.db.get<{ attributes_json: string }>(
      "SELECT attributes_json FROM characters WHERE id = ?",
      created.body.data.id
    );
    expect(JSON.parse(String(stored?.attributes_json))).toEqual(updated.body.data.attributes);
  });
});
