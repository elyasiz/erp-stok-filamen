export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "tidigo-erp-stok-filamen",
    mode: process.env.DATABASE_URL ? "database" : "not-configured",
    database: process.env.DATABASE_URL ? "configured" : "not-configured",
    privateStorage: process.env.BLOB_READ_WRITE_TOKEN ? "configured" : "not-configured",
    accounts: "required",
    authentication: "email-password",
    timestamp: new Date().toISOString(),
  });
}
