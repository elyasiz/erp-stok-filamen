import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as nodeCrypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";

let db, load, accounts, usage, inventory, auth;
const jar = new Map();
const origin = "https://tidigo.test";
const env = { DATABASE_URL:"in-memory-test-only", NODE_ENV:"production", AUTH_SETUP_TOKEN:"test-only-activation-secret-at-least-32-characters" };
const cookieJar = { get: name => jar.has(name) ? { value:jar.get(name) } : undefined, set:(name,value,options) => options?.maxAge === 0 ? jar.delete(name) : jar.set(name,value) };
before(async () => {
  db = new PGlite();
  const sql = (parts,...params) => {
    const query = parts.reduce((out,part,index)=>out+(index?`$${index}`:"")+part,"");
    return { query, params, then:(yes,no)=>db.query(query,params).then(result=>result.rows).then(yes,no) };
  };
  sql.transaction = async queries => {
    await db.exec("BEGIN");
    try { const output=[]; for(const query of queries) output.push((await db.query(query.query,query.params)).rows); await db.exec("COMMIT"); return output; }
    catch(error) { await db.exec("ROLLBACK"); throw error; }
  };
  const cache=new Map();
  load = file => {
    const filename=resolve(file.endsWith(".ts")?file:`src/lib/${file}.ts`);
    if(cache.has(filename)) return cache.get(filename);
    const module={exports:{}}; cache.set(filename,module.exports);
    const code=ts.transpileModule(readFileSync(filename,"utf8"), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code,{ exports:module.exports, process:{env}, crypto:{randomUUID:nodeCrypto.randomUUID}, Date, Intl, Request, Response, URL, Buffer, Error,
      require: name => {
        if(name === "server-only") return {};
        if(name === "@neondatabase/serverless") return {neon:()=>sql};
        if(name === "node:crypto") return nodeCrypto;
        if(name === "next/headers") return {cookies:async()=>cookieJar};
        if(name.startsWith("@/lib/")) return load(name.slice(6));
        if(name.startsWith("./")) return load(name.slice(2));
        throw Error(`Unexpected import ${name}`);
      }
    });
    return module.exports;
  };
  accounts=load("account-db"); usage=load("usage-db"); inventory=load("inventory-db"); auth=load("auth");
  await accounts.ensureAccountSchema(); await usage.ensureUsageSchema(); await load("receipts-db").ensureReceiptSchema();
});
beforeEach(async()=> { jar.clear(); await db.exec("TRUNCATE app_sessions,app_users,audit_events,usage_session_items,usage_sessions,inventory_items,goods_receipt_items,goods_receipts,auth_attempts CASCADE; UPDATE account_guard SET bootstrapped=false"); });
after(async()=>db.close());
const password = "kata sandi pribadi uji 2026";
const temporary = "TIDIGO sementara uji 2026";
const request = (path, method="GET", body, headers={}) => new Request(origin+path,{method,headers:{origin,"content-type":"application/json",...headers},...(body === undefined?{}:{body:JSON.stringify(body)})});
const context = id => ({params:Promise.resolve({id})});
async function owner() { await accounts.bootstrapOwner({name:"Owner",email:"owner@tidigo.test",password,setupToken:env.AUTH_SETUP_TOKEN}); return accounts.signInPassword("owner@tidigo.test",password); }
async function addUser(owner, email="coach@tidigo.test",role="COACH") { const user=await accounts.createUser(accounts.parseUser({email,name:email.split("@")[0],role,password:temporary}),owner); return (await accounts.changePassword(user,temporary,password)).user; }
async function login(email) { const result=await accounts.signInPassword(email,password); jar.set(auth.sessionCookie,result.token); return result; }
async function stock(actor) { return inventory.createInventoryItem({code:`FLM-${nodeCrypto.randomUUID().slice(0,8).toUpperCase()}`,product:"PLA Basic",material:"PLA",color:"Black",packagingType:"WITH_SPOOL",remainingGrams:1000,status:"AVAILABLE",unitCost:125000,supplier:"Test supplier"},actor); }

test("first Owner requires the private activation code and setup closes atomically",async()=> {
  assert.equal((await accounts.accountSetupStatus()).setupRequired,true);
  const input={name:"Owner",email:"OWNER@tidigo.test",password,role:"COACH"};
  await assert.rejects(accounts.bootstrapOwner({...input,setupToken:"wrong"}),/SETUP_DENIED/);
  await assert.rejects(accounts.signInPassword(input.email,password),/INVALID_CREDENTIALS/);
  const first=await accounts.bootstrapOwner({...input,setupToken:env.AUTH_SETUP_TOKEN});
  assert.equal(first.role,"OWNER"); assert.equal(first.email,"owner@tidigo.test");
  assert.equal(first.mustChangePassword,false);
  await assert.rejects(accounts.bootstrapOwner({...input,email:"second@tidigo.test",setupToken:env.AUTH_SETUP_TOKEN}),/SETUP_CLOSED/);
  assert.equal((await accounts.listUsers()).length,1);
  assert.equal((await accounts.accountSetupStatus()).setupRequired,false);
});

test("opaque sessions expire, are revoked on disable and never store raw tokens",async()=> {
  const root=await owner(); const coach=await addUser(root.user); const session=await login(coach.email);
  assert.equal((await accounts.userForSession(session.token)).id,coach.id);
  const stored=(await db.query("SELECT token_hash FROM app_sessions WHERE user_id=$1",[coach.id])).rows[0].token_hash;
  assert.notEqual(stored,session.token); assert.equal(stored.length,64);
  await accounts.updateUser(coach.id,{name:coach.name,role:"COACH",status:"DISABLED"},root.user);
  assert.equal(await accounts.userForSession(session.token),null);
  await assert.rejects(accounts.signInPassword(coach.email,password),/INVALID_CREDENTIALS/);
  await db.query("UPDATE app_sessions SET expires_at=now()-interval '1 second'");
  assert.equal(await accounts.userForSession(root.token),null);
});
test("email/password accepts ordinary addresses and protects Owner roles",async()=> {
  const root=await owner(); const coach=await addUser(root.user,"coach@external.test");
  assert.equal((await accounts.signInPassword("COACH@external.test",password)).user.id,coach.id);
  await assert.rejects(accounts.signInPassword(coach.email,"wrong password"),/INVALID_CREDENTIALS/);
  const second=await addUser(root.user,"owner2@tidigo.test","OWNER");
  await assert.rejects(accounts.updateUser(second.id,{name:second.name,role:"COACH",status:"DISABLED"},root.user),/Owner/);
  await assert.rejects(accounts.updateUser(root.user.id,{name:root.user.name,role:"ADMIN",status:"ACTIVE"},root.user),/sendiri/);
});

test("all data routes reject anonymous requests before reading or changing stock",async()=> {
  const id=nodeCrypto.randomUUID();
  for(const [file,methods] of [["inventory",["GET","POST"]],["inventory/[id]",["GET","PATCH","DELETE"]],["receipts",["GET","POST"]],["receipts/[id]",["GET","PATCH","DELETE"]],["usages",["GET","POST"]],["usages/[id]",["GET"]],["usages/[id]/complete",["POST"]],["reports",["GET"]],["users",["GET","POST"]],["users/[id]",["PATCH"]],["activity",["GET"]],["my-usage",["GET"]]]) {
    const route=load(`src/app/api/v1/${file}/route.ts`);
    for(const method of methods) assert.equal((await route[method](request(`/api/v1/${file.replace('[id]',id)}`,method,method==="GET"?undefined:{}),context(id))).status,401,`${method} ${file}`);
  }
});
test("coach cannot access administration or costs; forged borrower and cross-origin writes fail",async()=> {
  const root=await owner(); const coach=await addUser(root.user); const item=await stock(root.user); await login(coach.email);
  for(const file of ["reports","receipts","users","activity"]) assert.equal((await load(`src/app/api/v1/${file}/route.ts`).GET(request(`/api/v1/${file}`))).status,403,file);
  assert.equal((await load("src/app/api/v1/inventory/route.ts").POST(request("/api/v1/inventory","POST",{}))).status,403);
  const read=await load("src/app/api/v1/inventory/route.ts").GET(request("/api/v1/inventory")); assert.equal((await read.json()).items[0].unitCost,null);
  const start=load("src/app/api/v1/usages/route.ts");
  const input={borrowerUserId:root.user.id,userName:"Forged name",activityName:"Workshop",usageType:"CLASS",inventoryItemIds:[item.id]};
  assert.equal((await start.POST(request("/api/v1/usages","POST",input))).status,403);
  assert.equal((await start.POST(request("/api/v1/usages","POST",{...input,borrowerUserId:coach.id},{origin:"https://attacker.test"}))).status,403);
  const good=await start.POST(request("/api/v1/usages","POST",{...input,borrowerUserId:coach.id})); assert.equal(good.status,201,JSON.stringify(await good.clone().json()));
  const session=(await good.json()).session; assert.equal(session.userName,coach.name); assert.equal(session.createdByName,coach.name); assert.equal(session.borrowerUserId,coach.id);
});
test("ownership applies to barcode lookup, detail, completion, and personal history",async()=> {
  const root=await owner(), coach=await addUser(root.user), other=await addUser(root.user,"other@gmail.com");
  const item=await stock(root.user);
  const session=await usage.createUsageSession({...usage.parseUsageInput({userName:coach.name,usageType:"CLASS",activityName:"Workshop",inventoryItemIds:[item.id]}),borrowerUserId:coach.id},root.user);
  assert.equal(await usage.getUsageSession(session.id,other),null);
  assert.equal(await usage.findActiveUsageByBarcode(item.code,other),null);
  assert.equal((await usage.listMyUsageSessions(other)).length,0);
  assert.equal((await usage.listMyUsageSessions(coach)).length,1);
  const input=usage.parseUsageCompletionInput({result:"SUCCESS",notes:"",items:[{inventoryItemId:item.id,barcode:item.code,usedGrams:23.45}]});
  await assert.rejects(usage.completeUsageSession(session.id,input,other),/USAGE_NOT_FOUND/);
  assert.equal((await inventory.getInventoryItem(item.id)).remainingGrams,1000);
  const completed=await usage.completeUsageSession(session.id,input,coach); assert.equal(completed.completedByName,coach.name); assert.equal(completed.totalUsedGrams,23.45);
  assert.equal((await inventory.getInventoryItem(item.id)).remainingGrams,976.55);
  await assert.rejects(usage.completeUsageSession(session.id,input,coach),/USAGE_ALREADY_COMPLETED/);
  const events=await load("audit-db").listAuditEvents(); assert.ok(events.some(event=>event.action==="USAGE_STARTED" && event.actorName===root.user.name)); assert.ok(events.some(event=>event.action==="USAGE_COMPLETED" && event.actorName===coach.name));
});
test("stock corrections record exact balances and active stock cannot be edited",async()=> {
  const root=await owner(), item=await stock(root.user);
  await inventory.updateInventoryItem(item.id,{...item,remainingGrams:900},root.user,"Penimbangan ulang");
  const correction=(await load("audit-db").listAuditEvents()).find(event=>event.action==="STOCK_UPDATED");
  assert.equal(Number(correction.before.remaining_grams),1000); assert.equal(Number(correction.after.remaining_grams),900); assert.equal(correction.reason,"Penimbangan ulang");
  await usage.createUsageSession(usage.parseUsageInput({userName:root.user.name,usageType:"CLASS",inventoryItemIds:[item.id]}),root.user);
  assert.equal(await inventory.updateInventoryItem(item.id,{...item,remainingGrams:10},root.user,"Invalid correction"),null);
  assert.equal(await inventory.deleteInventoryItem(item.id,root.user,"Invalid removal"),false);
});
test("password hashes are salted and no credentials appear in API or audit data",async()=> {
  const hashing=load("password");
  const a=await hashing.hashPassword(password),b=await hashing.hashPassword(password);
  assert.notEqual(a,b); assert.ok(!a.includes(password));
  assert.equal(await hashing.verifyPassword(password,a),true);
  assert.equal(await hashing.verifyPassword("wrong",a),false);
  assert.equal(await hashing.verifyPassword(password,"scrypt$999999999$8$2$bad$bad"),false);
  await assert.rejects(hashing.hashPassword("short"));
  const root=await owner(); await addUser(root.user);
  const publicData=JSON.stringify([await accounts.listUsers(),await load("audit-db").listAuditEvents()]);
  assert.ok(!publicData.includes(password)); assert.ok(!publicData.includes(temporary)); assert.ok(!publicData.includes("scrypt$")); assert.ok(!publicData.includes("password_hash"));
});

test("temporary passwords restrict data access and changing/resetting revokes sessions",async()=> {
  const root=await owner();
  const coach=await accounts.createUser(accounts.parseUser({name:"Coach",email:"coach@tidigo.test",role:"COACH",password:temporary}),root.user);
  const initial=await accounts.signInPassword(coach.email,temporary); jar.set(auth.sessionCookie,initial.token);
  assert.equal(initial.user.mustChangePassword,true);
  assert.equal((await load("src/app/api/v1/inventory/route.ts").GET(request("/api/v1/inventory"))).status,403);
  const wrong=await load("src/app/api/v1/auth/password/route.ts").POST(request("/api/v1/auth/password","POST",{currentPassword:"incorrect",password})); assert.equal(wrong.status,401);
  const changed=await load("src/app/api/v1/auth/password/route.ts").POST(request("/api/v1/auth/password","POST",{currentPassword:temporary,password}));
  assert.equal(changed.status,200); assert.equal((await changed.json()).user.mustChangePassword,false);
  assert.equal(await accounts.userForSession(initial.token),null);
  const newToken=jar.get(auth.sessionCookie); assert.ok(await accounts.userForSession(newToken));
  await accounts.updateUser(coach.id,{name:coach.name,role:"COACH",status:"ACTIVE",password:temporary},root.user);
  assert.equal(await accounts.userForSession(newToken),null);
  await assert.rejects(accounts.signInPassword(coach.email,password),/INVALID_CREDENTIALS/);
  assert.equal((await accounts.signInPassword(coach.email,temporary)).user.mustChangePassword,true);
});

test("login and setup reject cross-origin requests and enforce persistent attempt limits",async()=> {
  const root=await owner(),route=load("src/app/api/v1/auth/login/route.ts");
  assert.equal((await route.POST(request("/api/v1/auth/login","POST",{email:root.user.email,password},{origin:"https://attacker.test"}))).status,403);
  assert.equal((await load("src/app/api/v1/auth/setup/route.ts").POST(request("/api/v1/auth/setup","POST",{},{origin:"https://attacker.test"}))).status,403);
  const good=await route.POST(request("/api/v1/auth/login","POST",{email:root.user.email,password}));
  assert.equal(good.status,200); assert.ok(jar.get(auth.sessionCookie));
  for(let i=0;i<10;i++) assert.equal((await route.POST(request("/api/v1/auth/login","POST",{email:root.user.email,password:"wrong password"}))).status,401);
  const limited=await route.POST(request("/api/v1/auth/login","POST",{email:root.user.email,password})); assert.equal(limited.status,429); assert.equal(limited.headers.get("retry-after"),"900");
  await db.exec("UPDATE auth_attempts SET window_start=now()-interval '16 minutes'");
  assert.equal((await route.POST(request("/api/v1/auth/login","POST",{email:root.user.email,password}))).status,200);
  for(let i=0;i<3;i++) await accounts.consumeAuthAttempt("shared-ip",3);
  await assert.rejects(accounts.consumeAuthAttempt("shared-ip",3),/TOO_MANY_ATTEMPTS/);
});

test("simultaneous activation requests create exactly one Owner",async()=> {
  const input={name:"Owner",password,setupToken:env.AUTH_SETUP_TOKEN};
  const results=await Promise.allSettled([accounts.bootstrapOwner({...input,email:"first@tidigo.test"}),accounts.bootstrapOwner({...input,email:"second@tidigo.test"})]);
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(results.filter(result=>result.status==="rejected" && /SETUP_CLOSED/.test(result.reason.message)).length,1);
  assert.equal((await accounts.listUsers()).length,1);
});
