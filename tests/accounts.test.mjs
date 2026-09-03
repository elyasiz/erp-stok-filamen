import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as nodeCrypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import * as jose from "jose";
import ts from "typescript";

let db, load, accounts, usage, inventory, auth, privateKey;
const jar = new Map();
const origin = "https://tidigo.test";
const env = { DATABASE_URL:"in-memory-test-only", NODE_ENV:"production", GOOGLE_CLIENT_ID:"test-client", AUTH_OWNER_EMAIL:"owner@gmail.com" };
const cookieJar = { get: name => jar.has(name) ? { value:jar.get(name) } : undefined, set:(name,value,options) => options?.maxAge === 0 ? jar.delete(name) : jar.set(name,value) };
before(async () => {
  db = new PGlite();
  const pair = await jose.generateKeyPair("RS256"); privateKey=pair.privateKey;
  const jwk = { ...await jose.exportJWK(pair.publicKey), kid:"test-key", alg:"RS256" };
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
    runInNewContext(code,{ exports:module.exports, process:{env}, crypto:{randomUUID:nodeCrypto.randomUUID}, Date, Intl, Request, Response, URL, Buffer,
      require: name => {
        if(name === "server-only") return {};
        if(name === "@neondatabase/serverless") return {neon:()=>sql};
        if(name === "node:crypto") return nodeCrypto;
        if(name === "next/headers") return {cookies:async()=>cookieJar};
        if(name === "jose") return { ...jose, createRemoteJWKSet:()=>jose.createLocalJWKSet({keys:[jwk]}) };
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
beforeEach(async()=> { jar.clear(); await db.exec("TRUNCATE app_sessions,app_users,audit_events,usage_session_items,usage_sessions,inventory_items,goods_receipt_items,goods_receipts CASCADE"); });
after(async()=>db.close());
const identity = (email,sub=email) => ({ email,sub,name:email.split("@")[0],authoritativeEmail:true });
const request = (path, method="GET", body, headers={}) => new Request(origin+path,{method,headers:{origin,"content-type":"application/json",...headers},...(body === undefined?{}:{body:JSON.stringify(body)})});
const context = id => ({params:Promise.resolve({id})});
async function owner() { return accounts.signInGoogle(identity("owner@gmail.com")); }
async function addUser(owner, email="coach@gmail.com",role="COACH") { return accounts.createUser(accounts.parseUser({email,name:email.split("@")[0],role}),owner); }
async function login(email) { const result=await accounts.signInGoogle(identity(email)); jar.set(auth.sessionCookie,result.token); return result; }
async function stock(actor) { return inventory.createInventoryItem({code:`FLM-${nodeCrypto.randomUUID().slice(0,8).toUpperCase()}`,product:"PLA Basic",material:"PLA",color:"Black",packagingType:"WITH_SPOOL",remainingGrams:1000,status:"AVAILABLE",unitCost:125000,supplier:"Test supplier"},actor); }

test("only the configured Google owner can bootstrap; other accounts require registration",async()=> {
  await assert.rejects(accounts.signInGoogle(identity("outsider@gmail.com")),/ACCOUNT_NOT_ALLOWED/);
  const first=await owner(); assert.equal(first.user.role,"OWNER");
  assert.equal((await accounts.listUsers()).length,1);
  await accounts.signInGoogle(identity("owner@gmail.com")); assert.equal((await accounts.listUsers()).length,1);
  await assert.rejects(accounts.signInGoogle({...identity("owner@gmail.com","another-sub"),authoritativeEmail:true}),/ACCOUNT_NOT_ALLOWED/);
});
test("opaque sessions expire, are revoked on disable and never store raw tokens",async()=> {
  const root=await owner(); const coach=await addUser(root.user); const session=await login(coach.email);
  assert.equal((await accounts.userForSession(session.token)).id,coach.id);
  const stored=(await db.query("SELECT token_hash FROM app_sessions WHERE user_id=$1",[coach.id])).rows[0].token_hash;
  assert.notEqual(stored,session.token); assert.equal(stored.length,64);
  await accounts.updateUser(coach.id,{name:coach.name,role:"COACH",status:"DISABLED"},root.user);
  assert.equal(await accounts.userForSession(session.token),null);
  await assert.rejects(accounts.signInGoogle(identity(coach.email)),/ACCOUNT_NOT_ALLOWED/);
  await db.query("UPDATE app_sessions SET expires_at=now()-interval '1 second'");
  assert.equal(await accounts.userForSession(root.token),null);
});
test("Google subject is stable; untrusted email linking and owner demotion are rejected",async()=> {
  const root=await owner(); const coach=await addUser(root.user,"coach@external.test");
  await assert.rejects(accounts.signInGoogle({...identity(coach.email),authoritativeEmail:false}),/ACCOUNT_NOT_ALLOWED/);
  const second=await addUser(root.user,"owner2@gmail.com","OWNER");
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
test("real JWT verification rejects bad signature, audience, issuer, expiry, nonce and unverified email",async()=> {
  const nonce=nodeCrypto.randomBytes(32).toString("base64url");
  const claims={email:"coach@gmail.com",email_verified:true,nonce,name:"Coach"};
  const sign=(overrides={},key=privateKey)=>new jose.SignJWT({...claims,...overrides}).setProtectedHeader({alg:"RS256",kid:"test-key"}).setIssuer("https://accounts.google.com").setAudience("test-client").setSubject("coach-sub").setIssuedAt().setExpirationTime("5m").sign(key);
  assert.equal((await auth.verifyGoogleCredential(await sign(),nonce)).sub,"coach-sub");
  await assert.rejects(auth.verifyGoogleCredential(await sign(),nonce,"wrong-client"));
  await assert.rejects(auth.verifyGoogleCredential(await sign({nonce:"bad-nonce"}),nonce));
  await assert.rejects(auth.verifyGoogleCredential(await sign({email_verified:false}),nonce));
  const wrongKey=(await jose.generateKeyPair("RS256")).privateKey; await assert.rejects(auth.verifyGoogleCredential(await sign({},wrongKey),nonce));
  for(const issuer of ["https://attacker.test","https://accounts.google.com"]) {
    const token=await new jose.SignJWT(claims).setProtectedHeader({alg:"RS256",kid:"test-key"}).setIssuer(issuer).setAudience("test-client").setSubject("coach-sub").setIssuedAt().setExpirationTime(issuer.includes("attacker")?"5m":0).sign(privateKey);
    await assert.rejects(auth.verifyGoogleCredential(token,nonce));
  }
});
